import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// GET EVENT DETAILS FOR ATTENDEE VIEW
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        name,
        description,
        event_date,
        location,
        cover_image_url,
        status,
        photographers (
          display_name,
          profile_photo_url
        ),
        event_pricing (
          price_per_media,
          unlock_all_price,
          currency,
          is_free
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if attendee has access (consent or public event)
    const { data: consent } = await supabase
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', user.id)
      .eq('event_id', eventId)
      .is('withdrawn_at', null)
      .single();

    // For now, allow access if event is public or has consent
    // In production, you'd also check for face matches

    // Get matched photos for this attendee
    // This is a placeholder - in production you'd query based on face matching
    const matchedPhotos: any[] = [];

    // Get purchased photos
    const { data: entitlements } = await supabase
      .from('entitlements')
      .select('media_id')
      .eq('attendee_id', user.id)
      .eq('event_id', eventId);

    const purchasedMediaIds = new Set(entitlements?.map(e => e.media_id) || []);

    const pricing = event.event_pricing as any;
    const photographer = event.photographers as any;

    return NextResponse.json({
      id: event.id,
      name: event.name,
      description: event.description,
      date: event.event_date
        ? new Date(event.event_date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : 'No date',
      location: event.location,
      coverImage: event.cover_image_url,
      photographerName: photographer?.display_name || 'Unknown Photographer',
      photographerAvatar: photographer?.profile_photo_url,
      totalPhotos: 0, // Would be total photos in event
      matchedPhotos: matchedPhotos.map(photo => ({
        id: photo.id,
        url: photo.storage_path,
        thumbnailUrl: photo.thumbnail_path || photo.storage_path,
        isPurchased: purchasedMediaIds.has(photo.id),
        isWatermarked: !pricing?.is_free && !purchasedMediaIds.has(photo.id),
        price: pricing?.price_per_media || 0,
      })),
      pricing: {
        pricePerPhoto: pricing?.price_per_media || 0,
        unlockAllPrice: pricing?.unlock_all_price,
        currency: pricing?.currency || 'USD',
        isFree: pricing?.is_free || false,
      },
    });

  } catch (error) {
    console.error('Failed to get event details:', error);
    return NextResponse.json(
      { error: 'Failed to load event' },
      { status: 500 }
    );
  }
}
