export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { searchEventCollectionWithFallback } from '@/lib/aws/rekognition';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createStorageSignedUrl, getStorageProvider } from '@/lib/storage/provider';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

// ============================================
// FACE SEARCH API
// Search for photos matching an attendee's face
// Supports both JSON and FormData formats
// ============================================

type SearchableEvent = {
  id: string;
  name: string;
  event_date?: string | null;
  location?: string | null;
  status?: string | null;
  is_public?: boolean | null;
  allow_anonymous_scan?: boolean | null;
  face_recognition_enabled?: boolean | null;
};

type EventMediaRow = {
  id: string;
  event_id: string;
  thumbnail_path?: string | null;
  storage_path?: string | null;
  watermarked_path?: string | null;
};

type NormalizedMatch = {
  id: string;
  mediaId: string;
  eventId: string;
  eventName: string;
  eventDate: string | null;
  eventLocation: string | null;
  thumbnailUrl: string;
  thumbnail_path: string;
  storage_path: string;
  similarity: number;
};

type EventMediaStats = {
  mediaCount: number;
  latestMediaCreatedAt: string | null;
};

type AttendeeEventScanStateRow = {
  attendee_id: string;
  event_id: string;
  last_scan_at: string;
  last_result_match_count: number;
  last_media_count_at_scan: number;
  last_latest_media_created_at_at_scan: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_CHUNK_SIZE = 100;

function cleanStoragePath(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('/') ? path.slice(1) : path;
}

function decodeBase64Image(raw: string): Buffer {
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  return Buffer.from(base64, 'base64');
}

async function createSignedUrlMap(
  serviceClient: any,
  rawPaths: string[]
): Promise<Map<string, string>> {
  const uniquePaths = Array.from(
    new Set(
      rawPaths
        .map((path) => cleanStoragePath(path))
        .filter((path): path is string => Boolean(path))
    )
  );
  const signedUrlMap = new Map<string, string>();
  if (!uniquePaths.length) return signedUrlMap;

  for (let i = 0; i < uniquePaths.length; i += SIGNED_URL_CHUNK_SIZE) {
    const chunk = uniquePaths.slice(i, i + SIGNED_URL_CHUNK_SIZE);
    if (getStorageProvider() === 'supabase') {
      const { data, error } = await serviceClient.storage
        .from('media')
        .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (!row?.path || !row?.signedUrl) continue;
          signedUrlMap.set(row.path, row.signedUrl);
        }
      }
    }

    for (const path of chunk) {
      if (signedUrlMap.has(path)) continue;
      const single = await createStorageSignedUrl('media', path, SIGNED_URL_TTL_SECONDS, {
        supabaseClient: serviceClient,
      });
      if (single) {
        signedUrlMap.set(path, single);
      }
    }
  }

  return signedUrlMap;
}

async function getEventMediaStats(
  serviceClient: any,
  eventId: string
): Promise<EventMediaStats> {
  const [{ count }, { data: latestRows }] = await Promise.all([
    serviceClient
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('deleted_at', null),
    serviceClient
      .from('media')
      .select('created_at')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  return {
    mediaCount: count || 0,
    latestMediaCreatedAt: latestRows?.[0]?.created_at || null,
  };
}

function hasNewMediaSinceNoMatchScan(
  scanState: AttendeeEventScanStateRow | null,
  mediaStats: EventMediaStats
): boolean {
  if (!scanState) return true;
  if ((scanState.last_result_match_count || 0) > 0) return true;

  if (mediaStats.mediaCount > (scanState.last_media_count_at_scan || 0)) {
    return true;
  }

  const previousLatest = scanState.last_latest_media_created_at_at_scan;
  if (!previousLatest) {
    return Boolean(mediaStats.latestMediaCreatedAt);
  }

  if (!mediaStats.latestMediaCreatedAt) {
    return false;
  }

  return (
    Date.parse(mediaStats.latestMediaCreatedAt) >
    Date.parse(previousLatest)
  );
}

async function getAttendeeEventScanState(
  serviceClient: any,
  attendeeId: string,
  eventId: string
): Promise<AttendeeEventScanStateRow | null> {
  const { data, error } = await serviceClient
    .from('attendee_event_scan_state')
    .select(
      'attendee_id, event_id, last_scan_at, last_result_match_count, last_media_count_at_scan, last_latest_media_created_at_at_scan'
    )
    .eq('attendee_id', attendeeId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    if (error.code !== '42P01') {
      console.error('Failed to read attendee scan state:', error);
    }
    return null;
  }

  return (data as AttendeeEventScanStateRow | null) || null;
}

async function upsertAttendeeEventScanState(
  serviceClient: any,
  attendeeId: string,
  eventId: string,
  resultMatchCount: number,
  mediaStats: EventMediaStats
) {
  const { error } = await serviceClient
    .from('attendee_event_scan_state')
    .upsert(
      {
        attendee_id: attendeeId,
        event_id: eventId,
        last_scan_at: new Date().toISOString(),
        last_result_match_count: resultMatchCount,
        last_media_count_at_scan: mediaStats.mediaCount,
        last_latest_media_created_at_at_scan: mediaStats.latestMediaCreatedAt,
      },
      {
        onConflict: 'attendee_id,event_id',
      }
    );

  if (error && error.code !== '42P01') {
    console.error('Failed to upsert attendee scan state:', error);
  }
}

async function canUserAccessEvent(
  serviceClient: any,
  userId: string,
  event: SearchableEvent
): Promise<boolean> {
  const isPublic = Boolean(event.is_public);
  const allowAnonymousScan = event.allow_anonymous_scan !== false;

  if (isPublic || allowAnonymousScan) {
    return true;
  }

  const [{ data: consent }, { data: entitlement }] = await Promise.all([
    serviceClient
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', userId)
      .eq('event_id', event.id)
      .is('withdrawn_at', null)
      .maybeSingle(),
    serviceClient
      .from('entitlements')
      .select('id')
      .eq('attendee_id', userId)
      .eq('event_id', event.id)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(consent?.id || entitlement?.id);
}

async function resolveSearchEvents(
  serviceClient: any,
  userId: string,
  eventId: string | null
): Promise<{ events: SearchableEvent[]; denied?: boolean }> {
  if (eventId) {
    const { data: event, error } = await serviceClient
      .from('events')
      .select(
        'id, name, event_date, location, status, is_public, allow_anonymous_scan, face_recognition_enabled'
      )
      .eq('id', eventId)
      .maybeSingle();

    if (error || !event) {
      return { events: [] };
    }
    if (event.face_recognition_enabled === false) {
      return { events: [] };
    }
    if (event.status && !['active', 'closed'].includes(String(event.status))) {
      return { events: [] };
    }

    const allowed = await canUserAccessEvent(serviceClient, userId, event as SearchableEvent);
    if (!allowed) {
      return { events: [], denied: true };
    }

    return { events: [event as SearchableEvent] };
  }

  const [{ data: consents }, { data: entitlements }] = await Promise.all([
    serviceClient
      .from('attendee_consents')
      .select('event_id')
      .eq('attendee_id', userId)
      .is('withdrawn_at', null),
    serviceClient
      .from('entitlements')
      .select('event_id')
      .eq('attendee_id', userId),
  ]);

  const eventIds = Array.from(
    new Set(
      [...(consents || []), ...(entitlements || [])]
        .map((row: any) => row?.event_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!eventIds.length) {
    return { events: [] };
  }

  const { data: events } = await serviceClient
    .from('events')
    .select(
      'id, name, event_date, location, status, is_public, allow_anonymous_scan, face_recognition_enabled'
    )
    .in('id', eventIds)
    .eq('face_recognition_enabled', true)
    .in('status', ['active', 'closed']);

  return { events: (events || []) as SearchableEvent[] };
}

export async function POST(request: NextRequest) {
  // Rate limiting for face operations
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, rateLimits.faceOps);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.user_metadata?.user_type !== 'attendee') {
      return NextResponse.json({ error: 'Only attendees can search for face matches' }, { status: 403 });
    }

    let imageBuffer: Buffer;
    let eventId: string | null = null;

    // Check content type to determine how to parse the request
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (from web scan page)
      const formData = await request.formData();
      eventId = formData.get('eventId') as string | null;
      
      // Get the first image from form data
      let imageFile: File | null = null;
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('image') && value instanceof File) {
          imageFile = value;
          break;
        }
      }

      if (!imageFile) {
        return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
      }

      // Convert File to Buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      // Handle JSON (from gallery scan page and mobile)
      const body = await request.json();
      const { image } = body;
      eventId = body.eventId || null;

      if (!image) {
        return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
      }

      // Convert base64 to buffer
      imageBuffer = decodeBase64Image(String(image));
    }

    const serviceClient = createServiceClient();
    const { events, denied } = await resolveSearchEvents(serviceClient, user.id, eventId);
    let scopedEventMediaStats: EventMediaStats | null = null;

    if (denied) {
      return NextResponse.json({ error: 'Access denied for this event' }, { status: 403 });
    }

    if (eventId && events.length > 0) {
      const [scanState, mediaStats] = await Promise.all([
        getAttendeeEventScanState(serviceClient, user.id, eventId),
        getEventMediaStats(serviceClient, eventId),
      ]);
      scopedEventMediaStats = mediaStats;

      if (!hasNewMediaSinceNoMatchScan(scanState, mediaStats)) {
        return NextResponse.json(
          {
            error:
              'No new photos have been uploaded since your last scan. Check back after new uploads.',
            code: 'scan_locked_no_new_uploads',
            canScan: false,
          },
          { status: 409 }
        );
      }
    }

    if (!events.length) {
      if (eventId && scopedEventMediaStats) {
        await upsertAttendeeEventScanState(serviceClient, user.id, eventId, 0, scopedEventMediaStats);
      }
      return NextResponse.json({
        totalMatches: 0,
        matches: [],
        groupedMatches: {},
        eventsSearched: 0,
      });
    }

    const similarityByEventMedia = new Map<string, number>();
    const mediaIdsByEvent = new Map<string, Set<string>>();

    for (const event of events) {
      try {
        const { response: searchResult } = await searchEventCollectionWithFallback(
          event.id,
          imageBuffer,
          100,
          88
        );

        const faceMatches = searchResult.FaceMatches || [];
        if (!faceMatches.length) continue;

        for (const faceMatch of faceMatches) {
          const mediaId = faceMatch.Face?.ExternalImageId;
          if (!mediaId) continue;

          const similarity = Number(faceMatch.Similarity || 0);
          const key = `${event.id}:${mediaId}`;
          const existing = similarityByEventMedia.get(key) || 0;
          if (similarity > existing) {
            similarityByEventMedia.set(key, similarity);
          }

          if (!mediaIdsByEvent.has(event.id)) {
            mediaIdsByEvent.set(event.id, new Set<string>());
          }
          mediaIdsByEvent.get(event.id)!.add(mediaId);
        }
      } catch (error: any) {
        if (error?.name !== 'ResourceNotFoundException') {
          console.error('Face search failed for event', event.id, error);
        }
      }
    }

    const allMediaRows: EventMediaRow[] = [];
    for (const event of events) {
      const eventMediaIds = Array.from(mediaIdsByEvent.get(event.id) || []);
      if (!eventMediaIds.length) continue;

      const { data: mediaRows } = await serviceClient
        .from('media')
        .select('id, event_id, thumbnail_path, storage_path, watermarked_path')
        .eq('event_id', event.id)
        .in('id', eventMediaIds)
        .is('deleted_at', null);

      if (mediaRows?.length) {
        allMediaRows.push(...(mediaRows as EventMediaRow[]));
      }
    }

    if (!allMediaRows.length) {
      if (eventId) {
        const mediaStats =
          scopedEventMediaStats || (await getEventMediaStats(serviceClient, eventId));
        await upsertAttendeeEventScanState(serviceClient, user.id, eventId, 0, mediaStats);
      }
      return NextResponse.json({
        totalMatches: 0,
        matches: [],
        groupedMatches: {},
        eventsSearched: events.length,
      });
    }

    const signedUrlMap = await createSignedUrlMap(
      serviceClient,
      allMediaRows
        .flatMap((media) => [media.thumbnail_path || null, media.watermarked_path || null, media.storage_path || null])
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
    );
    const eventMap = new Map<string, SearchableEvent>(events.map((event) => [event.id, event]));

    const matches: NormalizedMatch[] = [];
    const upsertRows: Array<{
      event_id: string;
      media_id: string;
      attendee_id: string;
      similarity: number;
      notified: boolean;
    }> = [];

    for (const media of allMediaRows) {
      const event = eventMap.get(media.event_id);
      if (!event) continue;

      const similarity = similarityByEventMedia.get(`${media.event_id}:${media.id}`);
      if (!similarity || similarity <= 0) continue;

      const thumbnailPath =
        cleanStoragePath(media.thumbnail_path) ||
        cleanStoragePath(media.watermarked_path) ||
        cleanStoragePath(media.storage_path);
      const previewPath =
        cleanStoragePath(media.watermarked_path) ||
        cleanStoragePath(media.storage_path) ||
        thumbnailPath;

      if (!thumbnailPath || !previewPath) continue;

      const thumbnailUrl = signedUrlMap.get(thumbnailPath);
      const previewUrl = signedUrlMap.get(previewPath);
      if (!thumbnailUrl || !previewUrl) continue;

      matches.push({
        id: media.id,
        mediaId: media.id,
        eventId: event.id,
        eventName: event.name || 'Unknown Event',
        eventDate: event.event_date || null,
        eventLocation: event.location || null,
        thumbnailUrl,
        thumbnail_path: thumbnailUrl,
        storage_path: previewUrl,
        similarity: Math.round(similarity * 100) / 100,
      });

      upsertRows.push({
        event_id: event.id,
        media_id: media.id,
        attendee_id: user.id,
        similarity: Math.round(similarity * 100) / 100,
        notified: false,
      });
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await serviceClient
        .from('photo_drop_matches')
        .upsert(upsertRows, {
          onConflict: 'event_id,media_id,attendee_id',
          ignoreDuplicates: true,
        });

      if (upsertError) {
        console.error('Failed to persist face matches:', upsertError);
      }
    }

    if (eventId) {
      const mediaStats =
        scopedEventMediaStats || (await getEventMediaStats(serviceClient, eventId));
      await upsertAttendeeEventScanState(serviceClient, user.id, eventId, matches.length, mediaStats);
    }

    matches.sort((a, b) => b.similarity - a.similarity);

    // Group by event
    const groupedMatches: Record<string, typeof matches> = {};
    for (const match of matches) {
      if (!groupedMatches[match.eventId]) {
        groupedMatches[match.eventId] = [];
      }
      groupedMatches[match.eventId].push(match);
    }

    return NextResponse.json({
      totalMatches: matches.length,
      matches,
      groupedMatches,
      eventsSearched: events.length,
    });

  } catch (error) {
    console.error('Face search error:', error);
    return NextResponse.json(
      { error: 'Failed to search for matches' },
      { status: 500 }
    );
  }
}

