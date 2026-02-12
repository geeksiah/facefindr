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

    // Get events from consents
    const { data: consents } = await supabase
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
      .is('withdrawn_at', null);

    // Get events from entitlements
    const { data: entitlements } = await supabase
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
      .eq('attendee_id', user.id);

    // Combine and deduplicate events
    const eventMap = new Map();

    const processEvents = (items: any[] | null) => {
      if (!items) return;
      for (const item of items) {
        if (item.events && !eventMap.has(item.event_id)) {
          eventMap.set(item.event_id, item.events);
        }
      }
    };

    processEvents(consents);
    processEvents(entitlements);

    // Also fetch publicly listed events
    const { data: publicEvents } = await supabase
      .from('events')
      .select(`
        id,
        name,
        event_date,
        location,
        cover_image_url,
        status,
        is_publicly_listed,
        photographers (
          display_name
        )
      `)
      .eq('is_publicly_listed', true)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100);

    // Add publicly listed events to the map
    if (publicEvents) {
      for (const event of publicEvents) {
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, {
            ...event,
            photographers: event.photographers || null,
          });
        }
      }
    }

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

    const rawEvents = Array.from(eventMap.values());
    const totalPhotoCounts = await Promise.all(
      rawEvents.map(async (event: any) => {
        const { count } = await serviceClient
          .from('media')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', event.id);
        return { eventId: event.id, count: count || 0 };
      })
    );
    const totalCountMap = new Map(totalPhotoCounts.map((row) => [row.eventId, row.count]));

    // Format events
    const events = rawEvents.map((event: any) => {
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
      location: event.location,
      coverImage: coverImage,
      photographerName: event.photographers?.display_name || 'Unknown',
      totalPhotos: totalCountMap.get(event.id) || 0,
      matchedPhotos: matchCounts.get(event.id) || 0,
      status: event.status === 'active' ? 'active' : event.status === 'closed' ? 'closed' : 'expired',
      };
    });

    // Sort by date (most recent first)
    events.sort((a, b) => {
      if (a.date === 'No date') return 1;
      if (b.date === 'No date') return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
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

