export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getStoragePublicUrl } from '@/lib/storage/provider';

function resolvePhotographerName(photographers: any): string {
  if (Array.isArray(photographers)) {
    const first = photographers.find((row: any) => row && typeof row === 'object');
    const candidate = first?.display_name || first?.name;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : 'Unknown Creator';
  }

  if (photographers && typeof photographers === 'object') {
    const candidate = photographers.display_name || photographers.name;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return 'Unknown Creator';
}

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

    const serviceClient = createServiceClient();

    // Get events from explicit attendee registration signals and existing face matches.
    const [{ data: consents }, { data: entitlements }, { data: matchedEventRows }] = await Promise.all([
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
      serviceClient
      .from('photo_drop_matches')
      .select('event_id')
      .eq('attendee_id', user.id),
    ]);

    // Combine and deduplicate events while tracking registration source.
    const eventMap = new Map<string, any>();
    const sourceMap = new Map<string, Set<'consent' | 'entitlement' | 'match'>>();

    const addEvent = (item: any, source: 'consent' | 'entitlement' | 'match') => {
      if (!item?.event_id || !item?.events) return;
      const event = item.events;
      if (!eventMap.has(item.event_id)) {
        eventMap.set(item.event_id, event);
      }
      const current = sourceMap.get(item.event_id) || new Set<'consent' | 'entitlement' | 'match'>();
      current.add(source);
      sourceMap.set(item.event_id, current);
    };

    (consents || []).forEach((item: any) => addEvent(item, 'consent'));
    (entitlements || []).forEach((item: any) => addEvent(item, 'entitlement'));

    const matchedEventIds: string[] = Array.from(
      new Set(
        (matchedEventRows || [])
          .map((row: any) => row?.event_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const missingMatchedEventIds = matchedEventIds.filter((eventId) => !eventMap.has(eventId));

    if (missingMatchedEventIds.length > 0) {
      const { data: matchedEvents } = await serviceClient
        .from('events')
        .select(`
          id,
          name,
          event_date,
          location,
          cover_image_url,
          status,
          photographers (
            display_name
          )
        `)
        .in('id', missingMatchedEventIds);

      (matchedEvents || []).forEach((event: any) =>
        addEvent({ event_id: event.id, events: event }, 'match')
      );
    }

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
      const sources = sourceMap.get(event.id) || new Set<'consent' | 'entitlement' | 'match'>();
      const registrationSource =
        sources.has('consent') && sources.has('entitlement')
          ? 'both'
          : sources.has('entitlement')
          ? 'entitlement'
          : sources.has('consent')
          ? 'consent'
          : 'match';
      const coverPath = event.cover_image_url?.startsWith('/')
        ? event.cover_image_url.slice(1)
        : event.cover_image_url;
      const coverImage = coverPath?.startsWith('http')
        ? coverPath
        : coverPath
        ? getStoragePublicUrl('covers', coverPath) || getStoragePublicUrl('events', coverPath)
        : null;

      return {
        id: event.id,
        name: event.name,
        date: formatEventDateDisplay(
          {
            event_date: event.event_date,
            event_start_at_utc: event.event_start_at_utc,
            event_timezone: null,
          },
          'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        ),
        eventDate: event.event_date || null,
        eventTimezone: 'UTC',
        eventStartAtUtc: event.event_start_at_utc || null,
        location: event.location,
        coverImage: coverImage,
        photographerName: resolvePhotographerName(event.photographers),
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

