export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { indexFacesFromImage, isRekognitionConfigured } from '@/lib/aws/rekognition';
import { getPhotographerIdCandidates } from '@/lib/profiles/ids';
import { downloadStorageObject } from '@/lib/storage/provider';
import { checkLimit, checkFeature, incrementFaceOps } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function isSupabaseNotFound(error: any): boolean {
  return error?.code === 'PGRST116';
}

function isUpstreamFailure(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    code.startsWith('08') ||
    code === '57014' ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('connection') ||
    message.includes('name_not_resolved') ||
    details.includes('network')
  );
}

/**
 * POST /api/media/process
 * Process a newly uploaded photo for face detection and indexing
 */
export async function POST(request: NextRequest) {
  try {
    const { mediaId, eventId } = await request.json();

    if (!mediaId || !eventId) {
      return NextResponse.json(
        { error: 'Missing mediaId or eventId' },
        { status: 400 }
      );
    }

    const authClient = await createClient();
    const serviceClient = createServiceClient();

    // Verify authentication
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);

    // Verify event access and face recognition is enabled
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select('photographer_id, face_recognition_enabled, face_ops_used')
      .eq('id', eventId)
      .maybeSingle();

    if (eventError) {
      console.error('Failed to resolve event during media processing:', {
        eventId,
        mediaId,
        userId: user.id,
        error: eventError,
      });
      if (isSupabaseNotFound(eventError)) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      if (isUpstreamFailure(eventError)) {
        return NextResponse.json(
          { error: 'Temporary upstream failure while loading event', code: 'UPSTREAM_UNAVAILABLE' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: eventError.message || 'Failed to load event' },
        { status: 500 }
      );
    }

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }
    let hasEventAccess = photographerIdCandidates.includes(event.photographer_id);
    if (!hasEventAccess && photographerIdCandidates.length > 0) {
      const { data: collaborator, error: collaboratorError } = await serviceClient
        .from('event_collaborators')
        .select('id')
        .eq('event_id', eventId)
        .in('photographer_id', photographerIdCandidates)
        .eq('status', 'active')
        .maybeSingle();

      if (collaboratorError && !isSupabaseNotFound(collaboratorError)) {
        console.error('Collaborator access lookup failed during media processing:', {
          eventId,
          userId: user.id,
          error: collaboratorError,
        });
        if (isUpstreamFailure(collaboratorError)) {
          return NextResponse.json(
            { error: 'Temporary upstream failure while checking permissions', code: 'UPSTREAM_UNAVAILABLE' },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { error: collaboratorError.message || 'Failed to verify collaborator access' },
          { status: 500 }
        );
      }
      hasEventAccess = Boolean(collaborator?.id);
    }

    if (!hasEventAccess) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // ENFORCE: Check if face recognition feature is enabled for the plan
    const canUseFaceRecognition = await checkFeature(event.photographer_id, 'face_recognition');
    if (!canUseFaceRecognition) {
      return NextResponse.json({
        success: false,
        error: 'Face recognition is not available on your current plan. Please upgrade.',
        code: 'FEATURE_NOT_ENABLED',
        feature: 'face_recognition',
        facesIndexed: 0,
      }, { status: 403 });
    }

    // Check if face recognition is enabled for this event
    if (!event.face_recognition_enabled) {
      return NextResponse.json({
        success: true,
        message: 'Face recognition disabled for this event',
        facesIndexed: 0,
      });
    }

    // Check if AWS Rekognition is configured
    if (!isRekognitionConfigured()) {
      console.warn('AWS Rekognition not configured, skipping face processing');
      return NextResponse.json({
        success: true,
        message: 'AWS Rekognition not configured',
        facesIndexed: 0,
      });
    }

    // ENFORCE: Check face ops limit using the enforcement system
    const faceOpsLimit = await checkLimit(event.photographer_id, 'face_ops', eventId);
    if (!faceOpsLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: faceOpsLimit.message || 'Face operations quota exceeded for this event. Please upgrade your plan.',
        code: 'LIMIT_EXCEEDED',
        limitType: 'face_ops',
        current: faceOpsLimit.current,
        limit: faceOpsLimit.limit,
        facesIndexed: 0,
      }, { status: 403 });
    }

    // Get the media record
    const { data: media, error: mediaError } = await serviceClient
      .from('media')
      .select('storage_path, faces_indexed')
      .eq('id', mediaId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (mediaError) {
      console.error('Failed to load media record for processing:', {
        mediaId,
        eventId,
        error: mediaError,
      });
      if (isSupabaseNotFound(mediaError)) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
      }
      if (isUpstreamFailure(mediaError)) {
        return NextResponse.json(
          { error: 'Temporary upstream failure while loading media', code: 'UPSTREAM_UNAVAILABLE' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: mediaError.message || 'Failed to load media record' },
        { status: 500 }
      );
    }

    if (!media) {
      return NextResponse.json(
        { error: 'Media not found' },
        { status: 404 }
      );
    }

    // Skip if already indexed
    if (media.faces_indexed) {
      return NextResponse.json({
        success: true,
        message: 'Already indexed',
        facesIndexed: 0,
      });
    }

    let imageBytes: Uint8Array;
    try {
      imageBytes = await downloadStorageObject('media', media.storage_path, {
        supabaseClient: serviceClient,
      });
    } catch (downloadError: any) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { error: downloadError?.message || 'Failed to download image' },
        { status: 500 }
      );
    }

    // Index faces in the image
    const { indexedFaces, facesDetected, error: indexError } = await indexFacesFromImage(
      eventId,
      mediaId,
      imageBytes
    );

    if (indexError) {
      console.error('Error indexing faces:', indexError);
      return NextResponse.json(
        { error: indexError },
        { status: 500 }
      );
    }

    // Store face embeddings in database
    if (indexedFaces.length > 0) {
      const faceRecords = indexedFaces.map((face) => ({
        event_id: eventId,
        media_id: mediaId,
        face_id: face.faceId,
        rekognition_face_id: face.faceId,
        bounding_box: face.boundingBox,
        confidence: face.confidence,
      }));

      const { error: insertError } = await serviceClient
        .from('face_embeddings')
        .insert(faceRecords);

      if (insertError) {
        console.error('Error storing face records:', insertError);
      }
    }

    // Update media record
    await serviceClient
      .from('media')
      .update({
        faces_detected: facesDetected,
        faces_indexed: true,
      })
      .eq('id', mediaId);

    // ENFORCE: Increment face ops counter using the enforcement system
    // This also validates the limit before incrementing
    try {
      await incrementFaceOps(eventId, facesDetected);
    } catch (error: any) {
      // If limit exceeded during increment, still return success for this batch
      // but warn that future operations may be blocked
      console.warn('Face ops limit warning:', error.message);
    }

    return NextResponse.json({
      success: true,
      facesIndexed: facesDetected,
      faces: indexedFaces.map((f) => ({
        faceId: f.faceId,
        confidence: f.confidence,
      })),
    });
  } catch (error) {
    console.error('Error processing media:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

