export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET ATTENDEE'S EVENTS
// Events where the attendee has matched photos or consents
// ============================================

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get events from explicit attendee registration signals.
    const [{ data: consents }, { data: entitlements }] = await Promise.all([
      supabase
      .from('attendee_consents')
      .select(`
        event_id,
        events (
          id,
          name,
          event_date,
          location,
          cover_image_url,
          status,
          photographers (
            display_name
          )
        )
      `)
      .eq('attendee_id', user.id)
      .is('withdrawn_at', null),
      supabase
      .from('entitlements')
      .select(`
        event_id,
        events (
          id,
          name,
          event_date,
          location,
          cover_image_url,
          status,
          photographers (
            display_name
          )
        )
      `)
      .eq('attendee_id', user.id),
    ]);

    // Combine and deduplicate events while tracking registration source.
    const eventMap = new Map<string, any>();
    const sourceMap = new Map<string, Set<'consent' | 'entitlement'>>();

    const addEvent = (item: any, source: 'consent' | 'entitlement') => {
      if (!item?.event_id || !item?.events) return;
      const event = item.events;
      if (!eventMap.has(item.event_id)) {
        eventMap.set(item.event_id, event);
      }
      const current = sourceMap.get(item.event_id) || new Set<'consent' | 'entitlement'>();
      current.add(source);
      sourceMap.set(item.event_id, current);
    };

    (consents || []).forEach((item: any) => addEvent(item, 'consent'));
    (entitlements || []).forEach((item: any) => addEvent(item, 'entitlement'));

    const serviceClient = createServiceClient();
    const attendeeId = user.id;
    const matchesRes = await serviceClient
      .from('photo_drop_matches')
      .select('event_id')
      .eq('attendee_id', attendeeId);
    const matchCounts = new Map<string, number>();
    (matchesRes.data || []).forEach((row: any) => {
      if (!row.event_id) return;
      matchCounts.set(row.event_id, (matchCounts.get(row.event_id) || 0) + 1);
    });

    const rawEvents = Array.from(eventMap.values()).filter((event: any) =>
      event?.id && ['active', 'closed', 'expired'].includes(String(event.status || '').toLowerCase())
    );

    const eventIds = rawEvents.map((event: any) => event.id);
    const { data: mediaRows } = await serviceClient
      .from('media')
      .select('event_id')
      .in('event_id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000'])
      .is('deleted_at', null);

    const totalCountMap = new Map<string, number>();
    (mediaRows || []).forEach((row: any) => {
      if (!row?.event_id) return;
      totalCountMap.set(row.event_id, (totalCountMap.get(row.event_id) || 0) + 1);
    });

    // Format events
    const events = rawEvents.map((event: any) => {
      const sources = sourceMap.get(event.id) || new Set<'consent' | 'entitlement'>();
      const registrationSource =
        sources.size === 2 ? 'both' : sources.has('entitlement') ? 'entitlement' : 'consent';
      const coverPath = event.cover_image_url?.startsWith('/')
        ? event.cover_image_url.slice(1)
        : event.cover_image_url;
      const coverImage = coverPath?.startsWith('http')
        ? coverPath
        : coverPath
        ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl
        : null;

      return {
        id: event.id,
        name: event.name,
        date: event.event_date
          ? new Date(event.event_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'No date',
        eventDate: event.event_date || null,
        location: event.location,
        coverImage: coverImage,
        photographerName: event.photographers?.display_name || 'Unknown',
        totalPhotos: totalCountMap.get(event.id) || 0,
        matchedPhotos: matchCounts.get(event.id) || 0,
        status: event.status === 'active' ? 'active' : event.status === 'closed' ? 'closed' : 'expired',
        registrationSource,
      };
    });

    // Sort by date (most recent first)
    events.sort((a, b) => {
      const aTime = a.eventDate ? Date.parse(a.eventDate) : 0;
      const bTime = b.eventDate ? Date.parse(b.eventDate) : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ events });

  } catch (error) {
    console.error('Failed to get attendee events:', error);
    return NextResponse.json(
      { error: 'Failed to load events' },
      { status: 500 }
    );
  }
}

