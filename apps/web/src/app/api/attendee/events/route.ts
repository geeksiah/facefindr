import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// GET ATTENDEE'S EVENTS
// Events where the attendee has matched photos or consents
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
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

    // Format events
    const events = Array.from(eventMap.values()).map((event: any) => ({
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
      coverImage: event.cover_image_url,
      photographerName: event.photographers?.display_name || 'Unknown',
      totalPhotos: 0, // Will be populated when we have face matching
      matchedPhotos: 0,
      status: event.status === 'active' ? 'active' : event.status === 'closed' ? 'closed' : 'expired',
    }));

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
