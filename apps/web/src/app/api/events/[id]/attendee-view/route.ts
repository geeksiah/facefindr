import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET EVENT DETAILS FOR ATTENDEE VIEW
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: eventId } = params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use service client to bypass RLS for event lookup
    // We'll validate access manually below
    const serviceClient = createServiceClient();

    // Get event details
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select(`
        id,
        name,
        description,
        event_date,
        location,
        cover_image_url,
        status,
        is_public,
        photographer_id,
        public_slug,
        allow_anonymous_scan,
        require_access_code,
        public_access_code,
        photographers (
          id,
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
      console.error('Event fetch error:', eventError);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if event is accessible
    // Event must be active and either:
    // 1. Public (is_public = true), OR
    // 2. User has consent for this event
    if (event.status !== 'active') {
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

    // Allow access if:
    // 1. Event is public (is_public = true), OR
    // 2. User has consent for this event, OR
    // 3. Event allows anonymous scan (allow_anonymous_scan = true)
    const hasAccess = event.is_public || !!consent || event.allow_anonymous_scan;

    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Access denied. This event requires consent or is not public.' },
        { status: 403 }
      );
    }

    // Get matched photos for this attendee
    const { data: matches } = await serviceClient
      .from('photo_drop_matches')
      .select(`
        media:media_id (
          id,
          storage_path,
          thumbnail_path,
          watermarked_path,
          created_at
        )
      `)
      .eq('attendee_id', user.id)
      .eq('event_id', eventId);

    const matchedPhotos = await Promise.all(
      (matches || [])
        .map((match: any) => match.media)
        .filter(Boolean)
        .map(async (media: any) => {
          const rawThumbnailPath = media.thumbnail_path || media.storage_path;
          const thumbnailPath = rawThumbnailPath?.startsWith('/') ? rawThumbnailPath.slice(1) : rawThumbnailPath;
          const watermarkedPath = media.watermarked_path?.startsWith('/')
            ? media.watermarked_path.slice(1)
            : media.watermarked_path;
          const { data: thumbData } = thumbnailPath
            ? await serviceClient.storage.from('media').createSignedUrl(thumbnailPath, 3600)
            : { data: null };
          const { data: watermarkedData } = watermarkedPath
            ? await serviceClient.storage.from('media').createSignedUrl(watermarkedPath, 3600)
            : { data: null };

          return {
            id: media.id,
            storage_path: media.storage_path,
            thumbnailUrl: thumbData?.signedUrl || null,
            watermarkedUrl: watermarkedData?.signedUrl || null,
            createdAt: media.created_at,
          };
        })
    );

    // Get purchased photos
    const { data: entitlements } = await supabase
      .from('entitlements')
      .select('media_id')
      .eq('attendee_id', user.id)
      .eq('event_id', eventId);

    const purchasedMediaIds = new Set(entitlements?.map(e => e.media_id) || []);

    const pricing = event.event_pricing as any;
    const photographer = event.photographers as any;

    const { count: totalPhotos } = await serviceClient
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);

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
      photographerId: event.photographer_id || photographer?.id,
      photographerName: photographer?.display_name || 'Unknown Photographer',
      photographerAvatar: photographer?.profile_photo_url,
      totalPhotos: totalPhotos || 0,
      matchedPhotos: matchedPhotos.map(photo => ({
        id: photo.id,
        url: photo.storage_path,
        thumbnailUrl: photo.thumbnailUrl || photo.storage_path,
        watermarkedUrl: photo.watermarkedUrl,
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
