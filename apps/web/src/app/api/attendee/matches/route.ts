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
          location,
          cover_image_url,
          photographers (
            display_name
          )
        )
      `)
      .eq('attendee_id', user.id)
      .order('matched_at', { ascending: false });

    const mediaIds = (matches || [])
      .map((match: any) => match.media?.id)
      .filter(Boolean);

    const { data: entitlements } = await supabase
      .from('entitlements')
      .select('media_id')
      .eq('attendee_id', user.id)
      .in('media_id', mediaIds.length ? mediaIds : ['00000000-0000-0000-0000-000000000000']);
    const purchased = new Set(entitlements?.map((e: any) => e.media_id) || []);

    const grouped: Record<string, any> = {};
    for (const match of matches || []) {
      const event = match.events as any;
      const media = match.media as any;
      if (!event || !media) continue;

      if (!grouped[event.id]) {
        const coverPath = event.cover_image_url?.startsWith('/')
          ? event.cover_image_url.slice(1)
          : event.cover_image_url;
        const coverImage = coverPath?.startsWith('http')
          ? coverPath
          : coverPath
          ? serviceClient.storage.from('covers').getPublicUrl(coverPath).data.publicUrl
          : null;

        grouped[event.id] = {
          id: event.id,
          name: event.name,
          date: event.event_date,
          location: event.location,
          photographerName: event.photographers?.display_name || 'Unknown',
          coverImage,
          photos: [],
        };
      }

      const rawThumbnailPath = media.thumbnail_path || media.storage_path;
      const thumbnailPath = rawThumbnailPath?.startsWith('/') ? rawThumbnailPath.slice(1) : rawThumbnailPath;
      const { data: thumbData } = thumbnailPath
        ? await serviceClient.storage.from('media').createSignedUrl(thumbnailPath, 3600)
        : { data: null };

      grouped[event.id].photos.push({
        id: media.id,
        url: media.storage_path,
        thumbnailUrl: thumbData?.signedUrl || null,
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

    const eventGroups = Object.values(grouped).map((group: any) => ({
      ...group,
      totalPhotos: group.photos.length,
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
