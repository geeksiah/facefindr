export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET ATTENDEE MATCHED PHOTOS
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    const { data: embeddings } = await supabase
      .from('user_face_embeddings')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    const hasScanned = (embeddings || []).length > 0;

    const { data: matches } = await serviceClient
      .from('photo_drop_matches')
      .select(`
        event_id,
        matched_at,
        media:media_id (
          id,
          storage_path,
          thumbnail_path,
          created_at
        ),
        events:event_id (
          id,
          name,
          event_date,
          event_timezone,
          location,
          cover_image_url,
          photographers (
            display_name
          )
        )
      `)
      .eq('attendee_id', user.id)
      .order('matched_at', { ascending: false });

    const mediaIds = (matches || []).map((match: any) => match.media?.id).filter(Boolean);
    const eventIds = Array.from(new Set((matches || []).map((match: any) => match.event_id).filter(Boolean)));

    const { data: entitlements } = await supabase
      .from('entitlements')
      .select('media_id')
      .eq('attendee_id', user.id)
      .in('event_id', eventIds.length ? eventIds : ['00000000-0000-0000-0000-000000000000']);
    const purchased = new Set(entitlements?.map((e: any) => e.media_id) || []);

    const PREVIEW_LIMIT_PER_EVENT = 6;
    const grouped: Record<string, any> = {};
    const totalByEvent = new Map<string, number>();

    for (const match of matches || []) {
      const event = match.events as any;
      const media = match.media as any;
      if (!event || !media) continue;

      totalByEvent.set(event.id, (totalByEvent.get(event.id) || 0) + 1);

      if (!grouped[event.id]) {
        const coverPath = event.cover_image_url?.startsWith('/')
          ? event.cover_image_url.slice(1)
          : event.cover_image_url;
        const coverImage = coverPath?.startsWith('http')
          ? coverPath
          : coverPath
          ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl ||
            serviceClient.storage.from('events').getPublicUrl(coverPath).data.publicUrl
          : null;

        grouped[event.id] = {
          id: event.id,
          name: event.name,
          date: event.event_date,
          eventDate: event.event_date || null,
          eventTimezone: event.event_timezone || 'UTC',
          eventStartAtUtc: event.event_start_at_utc || null,
          location: event.location,
          photographerName: event.photographers?.display_name || 'Unknown',
          coverImage,
          photos: [],
        };
      }

      if (grouped[event.id].photos.length >= PREVIEW_LIMIT_PER_EVENT) {
        continue;
      }

      const rawThumbnailPath = media.thumbnail_path || media.storage_path;
      const thumbnailPath = rawThumbnailPath?.startsWith('/') ? rawThumbnailPath.slice(1) : rawThumbnailPath;

      grouped[event.id].photos.push({
        id: media.id,
        thumbnailPath,
        storagePath: media.storage_path,
        eventId: event.id,
        eventName: event.name,
        eventDate: event.event_date,
        eventLocation: event.location,
        photographerName: grouped[event.id].photographerName,
        matchedAt: match.matched_at,
        confidence: 100,
        isPurchased: purchased.has(media.id),
        isWatermarked: !purchased.has(media.id),
      });
    }

    const previewPaths = Array.from(
      new Set(
        Object.values(grouped)
          .flatMap((group: any) => group.photos.map((photo: any) => photo.thumbnailPath))
          .filter(Boolean)
      )
    );

    const signedUrlEntries = await Promise.all(
      previewPaths.map(async (path) => {
        if (typeof path !== 'string') return [String(path), null] as const;
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        const { data } = await serviceClient.storage.from('media').createSignedUrl(cleanPath, 3600);
        return [path, data?.signedUrl || null] as const;
      })
    );
    const signedUrlMap = new Map<string, string | null>(signedUrlEntries);

    const eventGroups = Object.values(grouped).map((group: any) => ({
      ...group,
      photos: group.photos
        .map((photo: any) => {
        const signedThumbnail = photo.thumbnailPath ? signedUrlMap.get(photo.thumbnailPath) : null;

        if (!signedThumbnail) {
          return null;
        }

        return {
          id: photo.id,
          url: signedThumbnail,
          thumbnailUrl: signedThumbnail,
          eventId: photo.eventId,
          eventName: photo.eventName,
          eventDate: photo.eventDate,
          eventLocation: photo.eventLocation,
          photographerName: photo.photographerName,
          matchedAt: photo.matchedAt,
          confidence: photo.confidence,
          isPurchased: photo.isPurchased,
          isWatermarked: photo.isWatermarked,
        };
      })
        .filter(Boolean),
      totalPhotos: totalByEvent.get(group.id) || group.photos.length,
    }));

    return NextResponse.json({
      hasScanned,
      totalMatches: mediaIds.length,
      eventGroups,
    });
  } catch (error) {
    console.error('Failed to fetch matched photos:', error);
    return NextResponse.json({ error: 'Failed to load matches' }, { status: 500 });
  }
}

