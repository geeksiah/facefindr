export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface MediaInput {
  id: string;
  storage_path?: string | null;
  thumbnail_path?: string | null;
}

function buildPathCandidates(path: string | null | undefined): string[] {
  if (!path) return [];

  const trimmed = path.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return [trimmed];
  }

  const normalized = trimmed.replace(/^\/+/, '');
  const withoutMediaPrefix = normalized.replace(/^media\//, '');
  return Array.from(new Set([normalized, withoutMediaPrefix].filter(Boolean)));
}

async function getSignedUrlWithFallback(
  serviceClient: ReturnType<typeof createServiceClient>,
  input: MediaInput
) {
  const directUrl = [input.thumbnail_path, input.storage_path]
    .map((value) => (value || '').trim())
    .find((value) => value.startsWith('http://') || value.startsWith('https://'));

  if (directUrl) {
    return directUrl;
  }

  const paths = Array.from(
    new Set([
      ...buildPathCandidates(input.thumbnail_path),
      ...buildPathCandidates(input.storage_path),
    ])
  );

  if (paths.length === 0) {
    return null;
  }

  const buckets = ['media', 'events'];

  for (const bucket of buckets) {
    for (const path of paths) {
      const { data, error } = await serviceClient.storage.from(bucket).createSignedUrl(path, 3600);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    }
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = params.id;
    if (!eventId) {
      return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select('id, photographer_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    let hasAccess = photographerIdCandidates.includes(event.photographer_id);
    if (!hasAccess) {
      const { data: collaborator } = await serviceClient
        .from('event_collaborators')
        .select('id')
        .eq('event_id', eventId)
        .in('photographer_id', photographerIdCandidates)
        .in('status', ['accepted', 'active'])
        .maybeSingle();

      hasAccess = Boolean(collaborator);
    }

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const photos = Array.isArray(body?.photos) ? (body.photos as MediaInput[]) : [];

    if (photos.length === 0) {
      return NextResponse.json({ urls: {} });
    }

    const cappedPhotos = photos.slice(0, 100);
    const urls: Record<string, string> = {};

    await Promise.all(
      cappedPhotos.map(async (photo) => {
        if (!photo?.id) return;
        const signedUrl = await getSignedUrlWithFallback(serviceClient, photo);
        if (signedUrl) {
          urls[photo.id] = signedUrl;
        }
      })
    );

    return NextResponse.json({ urls });
  } catch (error) {
    console.error('Signed media URLs error:', error);
    return NextResponse.json({ error: 'Failed to sign media URLs' }, { status: 500 });
  }
}
