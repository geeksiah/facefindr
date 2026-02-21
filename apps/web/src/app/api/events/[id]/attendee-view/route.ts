export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { formatEventDateDisplay } from '@/lib/events/time';
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

    const eventSelect = `
        id,
        name,
        description,
        event_date,
        event_start_at_utc,
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
      `;

    const legacyEventSelect = `
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
      `;

    function getMissingColumnName(error: any): string | null {
      if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
      const quotedMatch = error.message.match(/column \"([^\"]+)\"/i);
      const bareMatch = error.message.match(/column\s+([a-zA-Z0-9_.]+)/i);
      const rawName = quotedMatch?.[1] || bareMatch?.[1] || null;
      if (!rawName) return null;
      return rawName.includes('.') ? rawName.split('.').pop() || rawName : rawName;
    }

    // Get event details
    let { data: event, error: eventError } = await serviceClient
      .from('events')
      .select(eventSelect)
      .eq('id', eventId)
      .single();

    const missingColumn = getMissingColumnName(eventError);
    const missingDateColumns = ['event_start_at_utc', 'event_timezone'];

    if (missingColumn && missingDateColumns.includes(missingColumn)) {
      const legacyResult = await serviceClient
        .from('events')
        .select(legacyEventSelect)
        .eq('id', eventId)
        .single();
      event = legacyResult.data;
      eventError = legacyResult.error;
    }

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
      .maybeSingle();

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

    const pricing = event.event_pricing as any;
    const pricingIsFree = Boolean(pricing?.is_free);

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

    const mediaRecords = (matches || [])
      .map((match: any) => match.media)
      .filter(Boolean);

    // Get purchased photos for this attendee.
    const { data: entitlements } = await supabase
      .from('entitlements')
      .select('media_id')
      .eq('attendee_id', user.id)
      .eq('event_id', eventId);
    const purchasedMediaIds = new Set(entitlements?.map((entry) => entry.media_id) || []);

    const toCleanPath = (path: string | null | undefined) =>
      path ? (path.startsWith('/') ? path.slice(1) : path) : null;

    const resolveThumbnailPath = (media: any) =>
      toCleanPath(media.thumbnail_path) ||
      toCleanPath(media.watermarked_path) ||
      toCleanPath(media.storage_path);

    const resolvePreviewPath = (media: any, isPurchased: boolean) => {
      const originalPath = toCleanPath(media.storage_path);
      const watermarkPath = toCleanPath(media.watermarked_path);
      const thumbnailPath = toCleanPath(media.thumbnail_path);

      if (pricingIsFree || isPurchased) {
        return originalPath || watermarkPath || thumbnailPath;
      }

      // Guardrail: unpaid attendees never receive the original path.
      return watermarkPath || thumbnailPath;
    };

    const uniquePaths = Array.from(
      new Set(
        mediaRecords
          .flatMap((media: any) => {
            const isPurchased = purchasedMediaIds.has(media.id);
            return [resolveThumbnailPath(media), resolvePreviewPath(media, isPurchased)];
          })
          .filter(Boolean)
      )
    ) as string[];

    const signedPathEntries = await Promise.all(
      uniquePaths.map(async (path) => {
        const { data } = await serviceClient.storage.from('media').createSignedUrl(path, 3600);
        return [path, data?.signedUrl || null] as const;
      })
    );
    const signedPathMap = new Map<string, string | null>(signedPathEntries);
    const photographer = event.photographers as any;

    const { count: totalPhotos } = await serviceClient
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('deleted_at', null);

    const coverPath = event.cover_image_url?.startsWith('/')
      ? event.cover_image_url.slice(1)
      : event.cover_image_url;
    const coverImage = coverPath?.startsWith('http')
      ? coverPath
      : coverPath
      ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl ||
        serviceClient.storage.from('events').getPublicUrl(coverPath).data.publicUrl
      : null;

    return NextResponse.json({
      id: event.id,
      name: event.name,
      description: event.description,
      date: formatEventDateDisplay(
        {
          event_date: event.event_date,
          event_start_at_utc: event.event_start_at_utc,
          event_timezone: null,
        },
        'en-US',
        {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }
      ),
      eventDate: event.event_date || null,
      eventTimezone: 'UTC',
      eventStartAtUtc: event.event_start_at_utc || null,
      location: event.location,
      coverImage,
      photographerId: event.photographer_id || photographer?.id,
      photographerName: photographer?.display_name || 'Unknown Creator',
      photographerAvatar: photographer?.profile_photo_url,
      totalPhotos: totalPhotos || 0,
      matchedPhotos: mediaRecords
        .map((media: any) => {
        const isPurchased = purchasedMediaIds.has(media.id);
        const thumbnailPath = resolveThumbnailPath(media);
        const previewPath = resolvePreviewPath(media, isPurchased);
        const thumbnailUrl = thumbnailPath ? signedPathMap.get(thumbnailPath) : null;
        const previewUrl = previewPath ? signedPathMap.get(previewPath) : null;
        const resolvedThumbnail = thumbnailUrl || previewUrl;

        if (!resolvedThumbnail) {
          return null;
        }

        return {
          id: media.id,
          url: previewUrl || resolvedThumbnail,
          thumbnailUrl: resolvedThumbnail,
          watermarkedUrl: !pricingIsFree && !isPurchased ? previewUrl || null : null,
          isPurchased,
          isWatermarked: !pricingIsFree && !isPurchased,
          price: pricing?.price_per_media || 0,
        };
      })
        .filter(Boolean),
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

