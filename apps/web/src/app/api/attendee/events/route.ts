export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { formatEventDateDisplay } from '@/lib/events/time';
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
          event_start_at_utc,
          event_timezone,
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
          event_start_at_utc,
          event_timezone,
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
    const totalCountEntries = await Promise.all(
      eventIds.map(async (eventId) => {
        const { count } = await serviceClient
          .from('media')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .is('deleted_at', null);
        return [eventId, count || 0] as const;
      })
    );
    const totalCountMap = new Map<string, number>(totalCountEntries);

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
        ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl ||
          serviceClient.storage.from('events').getPublicUrl(coverPath).data.publicUrl
        : null;

      return {
        id: event.id,
        name: event.name,
        date: formatEventDateDisplay(
          {
            event_date: event.event_date,
            event_start_at_utc: event.event_start_at_utc,
            event_timezone: event.event_timezone,
          },
          'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        ),
        eventDate: event.event_date || null,
        eventTimezone: event.event_timezone || 'UTC',
        eventStartAtUtc: event.event_start_at_utc || null,
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

