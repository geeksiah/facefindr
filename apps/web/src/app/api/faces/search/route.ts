export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { searchEventCollectionWithFallback } from '@/lib/aws/rekognition';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createStorageSignedUrl, getStorageProvider } from '@/lib/storage/provider';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';
import { normalizeUserType } from '@/lib/user-type';

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

type ExistingMatchRow = {
  event_id: string;
  media_id: string;
  similarity?: number | null;
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

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_CHUNK_SIZE = 100;
const parsedThreshold = Number(process.env.REKOGNITION_EVENT_MATCH_THRESHOLD || 80);
const FACE_MATCH_THRESHOLD = Number.isFinite(parsedThreshold)
  ? Math.min(99, Math.max(1, parsedThreshold))
  : 80;
const EVENT_ID_CHUNK_SIZE = 200;

function cleanStoragePath(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('/') ? path.slice(1) : path;
}

function decodeBase64Image(raw: string): Buffer {
  const base64 = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
  return Buffer.from(base64, 'base64');
}

function isNoFaceDetectedError(error: any): boolean {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    name === 'InvalidParameterException' &&
    (message.includes('no faces') || message.includes('no face'))
  );
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

async function getEventsWithIndexedFaces(
  serviceClient: any,
  eventIds: string[]
): Promise<Set<string>> {
  const readyEventIds = new Set<string>();
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  if (!uniqueEventIds.length) return readyEventIds;

  for (let i = 0; i < uniqueEventIds.length; i += EVENT_ID_CHUNK_SIZE) {
    const chunk = uniqueEventIds.slice(i, i + EVENT_ID_CHUNK_SIZE);
    const { data, error } = await serviceClient
      .from('face_embeddings')
      .select('event_id')
      .in('event_id', chunk)
      .limit(5000);

    if (error) {
      console.error('Failed to detect indexed-face readiness:', error);
      // Fail open so search is still possible on older schema/configs.
      return new Set(uniqueEventIds);
    }

    for (const row of data || []) {
      const rowEventId = (row as any)?.event_id;
      if (typeof rowEventId === 'string' && rowEventId.length > 0) {
        readyEventIds.add(rowEventId);
      }
    }
  }

  return readyEventIds;
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
    if (normalizeUserType(user.user_metadata?.user_type) !== 'attendee') {
      return NextResponse.json({ error: 'Only attendees can search for face matches' }, { status: 403 });
    }

    let imageBuffer: Buffer | null = null;
    let additionalImageBuffers: Buffer[] = [];
    let eventId: string | null = null;
    let allowProfileOnlySearch = false;

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
      allowProfileOnlySearch =
        body?.useFaceProfile === true || body?.searchMode === 'profile_only';

      if (!image && !allowProfileOnlySearch) {
        return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
      }

      if (image) {
        imageBuffer = decodeBase64Image(String(image));
      }
      additionalImageBuffers = Array.isArray(body.additionalImages)
        ? body.additionalImages
            .map((entry: any) => {
              const raw = typeof entry === 'string' ? entry : entry?.base64;
              if (!raw || typeof raw !== 'string') return null;
              try {
                return decodeBase64Image(raw);
              } catch {
                return null;
              }
            })
            .filter((value: Buffer | null): value is Buffer => Boolean(value))
        : [];
    }

    const searchBuffers = imageBuffer ? [imageBuffer, ...additionalImageBuffers] : [];
    const searchDiagnostics = {
      requestMode: searchBuffers.length > 0 ? 'selfie_plus_profile' : 'profile_only',
      searchBuffersCount: searchBuffers.length,
      faceMatchThreshold: FACE_MATCH_THRESHOLD,
      eventsResolved: 0,
      eventsEligibleForSearch: 0,
      eventsPendingIndexing: 0,
      rekognitionCallsAttempted: 0,
      rekognitionCallsSucceeded: 0,
      rekognitionCallsNoFaceDetected: 0,
      rekognitionCallsCollectionMissing: 0,
      rekognitionCallsFailed: 0,
      liveMatchesDetected: 0,
      persistedMatchesMerged: 0,
    };

    const serviceClient = createServiceClient();
    const { events, denied } = await resolveSearchEvents(serviceClient, user.id, eventId);
    searchDiagnostics.eventsResolved = events.length;
    let scopedEventMediaStats: EventMediaStats | null = null;

    if (denied) {
      return NextResponse.json({ error: 'Access denied for this event' }, { status: 403 });
    }

    if (eventId && events.length > 0) {
      const mediaStats = await getEventMediaStats(serviceClient, eventId);
      scopedEventMediaStats = mediaStats;
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
        searchDiagnostics,
      });
    }

    let searchableEvents = events;
    let eventsPendingIndexing: string[] = [];
    if (searchBuffers.length > 0) {
      const indexedReadyEventIds = await getEventsWithIndexedFaces(
        serviceClient,
        events.map((event) => event.id)
      );
      searchableEvents = events.filter((event) => indexedReadyEventIds.has(event.id));
      eventsPendingIndexing = events
        .map((event) => event.id)
        .filter((candidate) => !indexedReadyEventIds.has(candidate));
    }
    searchDiagnostics.eventsEligibleForSearch = searchableEvents.length;
    searchDiagnostics.eventsPendingIndexing = eventsPendingIndexing.length;

    const similarityByEventMedia = new Map<string, number>();
    const mediaIdsByEvent = new Map<string, Set<string>>();

    const recordFaceMatches = (resolvedEventId: string, faceMatches: any[]) => {
      if (!faceMatches.length) return;

      for (const faceMatch of faceMatches) {
        const mediaId = faceMatch.Face?.ExternalImageId;
        if (!mediaId) continue;

        const similarity = Number(faceMatch.Similarity || 0);
        const key = `${resolvedEventId}:${mediaId}`;
        const existing = similarityByEventMedia.get(key) || 0;
        if (similarity > existing) {
          similarityByEventMedia.set(key, similarity);
        }

        if (!mediaIdsByEvent.has(resolvedEventId)) {
          mediaIdsByEvent.set(resolvedEventId, new Set<string>());
        }
        mediaIdsByEvent.get(resolvedEventId)!.add(mediaId);
      }
    };

    if (searchBuffers.length > 0) {
      for (const event of searchableEvents) {
        for (const searchBuffer of searchBuffers) {
          searchDiagnostics.rekognitionCallsAttempted += 1;
          try {
            const { response: searchResult } = await searchEventCollectionWithFallback(
              event.id,
              searchBuffer,
              100,
              FACE_MATCH_THRESHOLD
            );
            searchDiagnostics.rekognitionCallsSucceeded += 1;
            const faceMatches = searchResult.FaceMatches || [];
            searchDiagnostics.liveMatchesDetected += faceMatches.length;
            recordFaceMatches(event.id, faceMatches);
          } catch (error: any) {
            if (error?.name === 'ResourceNotFoundException') {
              searchDiagnostics.rekognitionCallsCollectionMissing += 1;
              continue;
            }
            if (isNoFaceDetectedError(error)) {
              searchDiagnostics.rekognitionCallsNoFaceDetected += 1;
              continue;
            }
            searchDiagnostics.rekognitionCallsFailed += 1;
            console.error('Face search failed for event', event.id, error);
          }
        }
      }
    }

    // Selfie scan should augment the existing face profile reference, not replace it.
    // Merge already-saved attendee matches for the same scoped events.
    const scopedEventIds = events.map((event) => event.id);
    if (scopedEventIds.length > 0) {
      const { data: existingMatches } = await serviceClient
        .from('photo_drop_matches')
        .select('event_id, media_id, similarity')
        .eq('attendee_id', user.id)
        .in('event_id', scopedEventIds);

      for (const existingMatch of (existingMatches || []) as ExistingMatchRow[]) {
        if (!existingMatch.event_id || !existingMatch.media_id) continue;
        searchDiagnostics.persistedMatchesMerged += 1;

        if (!mediaIdsByEvent.has(existingMatch.event_id)) {
          mediaIdsByEvent.set(existingMatch.event_id, new Set<string>());
        }
        mediaIdsByEvent.get(existingMatch.event_id)!.add(existingMatch.media_id);

        const key = `${existingMatch.event_id}:${existingMatch.media_id}`;
        const existingSimilarity = similarityByEventMedia.get(key) || 0;
        const persistedSimilarity = Number(existingMatch.similarity || 100);
        if (persistedSimilarity > existingSimilarity) {
          similarityByEventMedia.set(key, persistedSimilarity);
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
      const processingHint =
        searchBuffers.length > 0 && eventsPendingIndexing.length > 0
          ? 'Photos are still being indexed for face search. Please retry shortly.'
          : null;

      if (eventId) {
        const mediaStats =
          scopedEventMediaStats || (await getEventMediaStats(serviceClient, eventId));
        await upsertAttendeeEventScanState(serviceClient, user.id, eventId, 0, mediaStats);
      }
      return NextResponse.json({
        totalMatches: 0,
        matches: [],
        groupedMatches: {},
        eventsSearched: searchableEvents.length,
        eventsEligibleForSearch: searchableEvents.length,
        eventsPendingIndexing,
        processingHint,
        searchDiagnostics,
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
      eventsSearched: searchableEvents.length,
      eventsEligibleForSearch: searchableEvents.length,
      eventsPendingIndexing,
      searchMode: searchBuffers.length > 0 ? 'selfie_plus_profile' : 'profile_only',
      searchDiagnostics,
    });

  } catch (error) {
    console.error('Face search error:', error);
    return NextResponse.json(
      { error: 'Failed to search for matches' },
      { status: 500 }
    );
  }
}

