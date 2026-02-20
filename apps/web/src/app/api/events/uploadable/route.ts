export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    if (!photographerIdCandidates.length) {
      return NextResponse.json({ events: [] });
    }

    const [{ data: ownedEvents }, { data: collaboratorRows }] = await Promise.all([
      serviceClient
        .from('events')
        .select('id, name, event_date, status')
        .in('photographer_id', photographerIdCandidates)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      serviceClient
        .from('event_collaborators')
        .select('event_id')
        .in('photographer_id', photographerIdCandidates)
        .eq('status', 'active'),
    ]);

    const collaboratorEventIds = Array.from(
      new Set((collaboratorRows || []).map((row) => row.event_id).filter(Boolean))
    ) as string[];

    let collaboratorEvents: any[] = [];
    if (collaboratorEventIds.length > 0) {
      const { data } = await serviceClient
        .from('events')
        .select('id, name, event_date, status')
        .in('id', collaboratorEventIds)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });
      collaboratorEvents = data || [];
    }

    const eventMap = new Map<string, any>();
    for (const event of ownedEvents || []) {
      eventMap.set(event.id, event);
    }
    for (const event of collaboratorEvents) {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    }

    const events = Array.from(eventMap.values());
    if (!events.length) {
      return NextResponse.json({ events: [] });
    }

    const { data: mediaRows } = await serviceClient
      .from('media')
      .select('event_id')
      .in('event_id', events.map((event) => event.id))
      .is('deleted_at', null);

    const mediaCountByEvent = new Map<string, number>();
    for (const row of mediaRows || []) {
      mediaCountByEvent.set(row.event_id, (mediaCountByEvent.get(row.event_id) || 0) + 1);
    }

    return NextResponse.json({
      events: events.map((event) => ({
        ...event,
        media_count: mediaCountByEvent.get(event.id) || 0,
      })),
    });
  } catch (error) {
    console.error('Uploadable events API error:', error);
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }
}
