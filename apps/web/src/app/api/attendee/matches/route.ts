export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

function cleanStoragePath(path?: string | null) {
  if (!path) return null;
  return path.startsWith('/') ? path.slice(1) : path;
}

async function createSignedUrlMap(serviceClient: any, paths: string[]) {
  const normalized = Array.from(new Set(paths.map((path) => cleanStoragePath(path)).filter(Boolean))) as string[];
  const map = new Map<string, string>();
  if (!normalized.length) return map;

  const { data, error } = await serviceClient.storage
    .from('media')
    .createSignedUrls(normalized, SIGNED_URL_TTL_SECONDS);

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      if (!row?.path || !row?.signedUrl) continue;
      map.set(row.path, row.signedUrl);
    }
  }

  // Fallback for any path that failed in bulk signing.
  for (const path of normalized) {
    if (map.has(path)) continue;
    const single = await serviceClient.storage
      .from('media')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (single.data?.signedUrl) {
      map.set(path, single.data.signedUrl);
    }
  }

  return map;
}

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

    const [{ data: embeddings }, { data: faceProfiles }] = await Promise.all([
      supabase
      .from('user_face_embeddings')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1),
      supabase
      .from('attendee_face_profiles')
      .select('id')
      .eq('attendee_id', user.id)
      .limit(1),
    ]);

    const hasScanned = (embeddings || []).length > 0 || (faceProfiles || []).length > 0;

    const { data: matches } = await serviceClient
      .from('photo_drop_matches')
      .select(`
        event_id,
        matched_at,
        media:media_id (
          id,
          storage_path,
          thumbnail_path,
          watermarked_path,
          created_at
        ),
        events:event_id (
          id,
          name,
          event_date,
          event_start_at_utc,
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
          eventTimezone: 'UTC',
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

      const rawThumbnailPath = media.thumbnail_path || media.watermarked_path || media.storage_path;
      const thumbnailPath = cleanStoragePath(rawThumbnailPath);

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

    const signedUrlMap = await createSignedUrlMap(serviceClient, previewPaths);

    const eventGroups = Object.values(grouped).map((group: any) => ({
      ...group,
      photos: group.photos
        .map((photo: any) => {
        const signedThumbnail = photo.thumbnailPath ? signedUrlMap.get(cleanStoragePath(photo.thumbnailPath) || '') : null;

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

