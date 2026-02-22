export const dynamic = 'force-dynamic';

import { DeleteFacesCommand, IndexFacesCommand } from '@aws-sdk/client-rekognition';
import { NextRequest, NextResponse } from 'next/server';

import { isRekognitionConfigured, rekognitionClient, ATTENDEE_COLLECTION_ID, searchEventCollectionWithFallback } from '@/lib/aws/rekognition';
import { ensureAttendeeCollection } from '@/lib/aws/rekognition-drop-in';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { normalizeUserType } from '@/lib/user-type';

// ============================================
// FACE REGISTRATION API
// Registers an attendee's face for photo matching
// Supports multiple images from guided scan for better accuracy
// ============================================

function mapRekognitionError(error: any): { status: number; error: string; code: string } | null {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const messageLower = message.toLowerCase();

  if (name === 'ResourceNotFoundException') {
    return {
      status: 503,
      error: 'Face recognition collection is not ready yet. Please retry in a few seconds.',
      code: 'REKOGNITION_COLLECTION_UNAVAILABLE',
    };
  }
  if (
    name === 'UnrecognizedClientException' ||
    name === 'InvalidSignatureException' ||
    name === 'AccessDeniedException'
  ) {
    return {
      status: 500,
      error: 'Face recognition credentials are invalid or missing required permissions.',
      code: 'REKOGNITION_AUTH_FAILED',
    };
  }
  if (name === 'InvalidImageFormatException') {
    return {
      status: 400,
      error: 'Unsupported image format. Please try again with a clearer camera capture.',
      code: 'REKOGNITION_INVALID_IMAGE',
    };
  }
  if (name === 'ImageTooLargeException') {
    return {
      status: 400,
      error: 'Captured image is too large to process. Please retake the scan.',
      code: 'REKOGNITION_IMAGE_TOO_LARGE',
    };
  }
  if (name === 'InvalidParameterException' && messageLower.includes('no faces')) {
    return {
      status: 400,
      error: 'No face detected. Please ensure your face is clearly visible.',
      code: 'REKOGNITION_NO_FACE_DETECTED',
    };
  }
  if (name === 'ThrottlingException' || name === 'ProvisionedThroughputExceededException') {
    return {
      status: 429,
      error: 'Face recognition is busy. Please retry in a moment.',
      code: 'REKOGNITION_THROTTLED',
    };
  }
  return null;
}

async function indexPrimaryAttendeeFace(params: {
  attendeeId: string;
  imageBytes: Uint8Array;
}) {
  const { attendeeId, imageBytes } = params;

  const buildCommand = () =>
    new IndexFacesCommand({
      CollectionId: ATTENDEE_COLLECTION_ID,
      Image: { Bytes: imageBytes },
      ExternalImageId: attendeeId, // Use attendee profile ID as external ID for consistency
      MaxFaces: 1,
      QualityFilter: 'HIGH',
      DetectionAttributes: ['ALL'],
    });

  try {
    return await rekognitionClient.send(buildCommand());
  } catch (firstError: any) {
    if (firstError?.name !== 'ResourceNotFoundException') {
      throw firstError;
    }

    const ensureCollection = await ensureAttendeeCollection();
    if (!ensureCollection.success) {
      const error = new Error(
        ensureCollection.error || 'Unable to create attendee face collection'
      ) as Error & { name?: string };
      error.name = ensureCollection.errorName || 'ResourceNotFoundException';
      throw error;
    }

    return await rekognitionClient.send(buildCommand());
  }
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
    if (!isRekognitionConfigured()) {
      return NextResponse.json(
        { error: 'Face recognition is temporarily unavailable. Please try again later.', code: 'REKOGNITION_NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an attendee
    const userType = normalizeUserType(user.user_metadata?.user_type);
    if (userType !== 'attendee') {
      return NextResponse.json(
        { error: 'Only attendees can register face profiles' },
        { status: 403 }
      );
    }

    const serviceClient = createServiceClient();
    const { data: attendeeProfile } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!attendeeProfile?.id) {
      return NextResponse.json(
        { error: 'Attendee profile not found. Please complete attendee setup first.' },
        { status: 404 }
      );
    }
    const attendeeId = attendeeProfile.id as string;

    const body = await request.json();
    
    // Support both single image and multiple images from guided scan
    const images: string[] = body.images || (body.image ? [body.image] : []);
    const primaryImage = body.primaryImage || images[0];

    if (!primaryImage) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }
    if (images.length < 5) {
      return NextResponse.json(
        { error: 'Face profile setup requires 5 guided captures (center, left, right, up, down).' },
        { status: 400 }
      );
    }

    // Convert base64 to buffer (use primary image for initial registration)
    const imageBuffer = Buffer.from(primaryImage, 'base64');
    const imageBytes = new Uint8Array(imageBuffer);

    let indexResult;
    try {
      // Index face in global collection for drop-in matching.
      // Retry once after creating the collection when it does not exist yet.
      indexResult = await indexPrimaryAttendeeFace({ attendeeId, imageBytes });
    } catch (indexError: any) {
      console.error('Face registration index error:', indexError);
      const mappedError = mapRekognitionError(indexError);
      if (mappedError) {
        return NextResponse.json(
          { error: mappedError.error, code: mappedError.code },
          { status: mappedError.status }
        );
      }
      throw indexError;
    }

    if (!indexResult.FaceRecords || indexResult.FaceRecords.length === 0) {
      return NextResponse.json(
        { error: 'No face detected. Please ensure your face is clearly visible.' },
        { status: 400 }
      );
    }

    const faceRecord = indexResult.FaceRecords[0];
    const rekognitionFaceId = faceRecord.Face?.FaceId;

    if (!rekognitionFaceId) {
      return NextResponse.json(
        { error: 'Failed to process face. Please try again.' },
        { status: 500 }
      );
    }

    // Store face profile in database
    // Replace any existing active profile to avoid stale identity linkage.
    const [{ data: existingEmbeddings }, { data: existingLegacyProfiles }] = await Promise.all([
      serviceClient
        .from('user_face_embeddings')
        .select('rekognition_face_id')
        .eq('user_id', user.id)
        .eq('is_active', true),
      serviceClient
        .from('attendee_face_profiles')
        .select('rekognition_face_id')
        .eq('attendee_id', attendeeId),
    ]);

    const existingFaceIds = Array.from(
      new Set(
        [...(existingEmbeddings || []), ...(existingLegacyProfiles || [])]
          .map((row: any) => row?.rekognition_face_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (existingFaceIds.length > 0) {
      try {
        await rekognitionClient.send(
          new DeleteFacesCommand({
            CollectionId: ATTENDEE_COLLECTION_ID,
            FaceIds: existingFaceIds,
          })
        );
      } catch (deleteError) {
        console.warn('Failed to delete old attendee faces from Rekognition:', deleteError);
      }
    }

    await serviceClient
      .from('user_face_embeddings')
      .update({ is_active: false, is_primary: false })
      .eq('user_id', user.id)
      .eq('user_type', 'attendee');

    // Remove any existing face profiles (we keep only one primary)
    await serviceClient
      .from('attendee_face_profiles')
      .delete()
      .eq('attendee_id', attendeeId);

    // Insert new face profile
    const { error: insertError } = await serviceClient
      .from('attendee_face_profiles')
      .insert({
        attendee_id: attendeeId,
        rekognition_face_id: rekognitionFaceId,
        is_primary: true,
        source: 'initial_scan',
        confidence: faceRecord.Face?.Confidence || 0,
      });

    if (insertError) {
      console.error('Failed to store face profile:', insertError);
      return NextResponse.json(
        { error: 'Failed to save face profile' },
        { status: 500 }
      );
    }

    const { error: insertEmbeddingError } = await serviceClient
      .from('user_face_embeddings')
      .insert({
        user_id: user.id,
        user_type: 'attendee',
        rekognition_face_id: rekognitionFaceId,
        source: 'initial_scan',
        confidence: faceRecord.Face?.Confidence || 0,
        is_primary: true,
        is_active: true,
        metadata: {
          capture_mode: 'guided_5_pose',
          pose_index: 0,
        },
      });
    if (insertEmbeddingError) {
      console.error('Failed to store primary user face embedding:', insertEmbeddingError);
    }

    // Update attendee's last_face_refresh timestamp
    await serviceClient
      .from('attendees')
      .update({ last_face_refresh: new Date().toISOString() })
      .eq('id', attendeeId);

    // If we have additional images from guided scan, index them too
    // This improves matching accuracy by having multiple angles
    const additionalImages = images.slice(1);
    for (let i = 0; i < additionalImages.length; i++) {
      try {
        const additionalBuffer = Buffer.from(additionalImages[i], 'base64');
        const additionalBytes = new Uint8Array(additionalBuffer);
        const additionalCommand = new IndexFacesCommand({
          CollectionId: ATTENDEE_COLLECTION_ID,
          Image: { Bytes: additionalBytes },
          ExternalImageId: `${attendeeId}_angle_${i + 1}`, // Index in global collection for drop-in
          MaxFaces: 1,
          QualityFilter: 'MEDIUM', // Less strict for angled faces
          DetectionAttributes: ['DEFAULT'],
        });

        const additionalResult = await rekognitionClient.send(additionalCommand);
        
        if (additionalResult.FaceRecords && additionalResult.FaceRecords.length > 0) {
          // Store additional face profile (non-primary)
          await serviceClient
            .from('attendee_face_profiles')
            .insert({
              attendee_id: attendeeId,
              rekognition_face_id: additionalResult.FaceRecords[0].Face?.FaceId || '',
              is_primary: false,
              source: 'initial_scan',
              confidence: additionalResult.FaceRecords[0].Face?.Confidence || 0,
            });

          await serviceClient
            .from('user_face_embeddings')
            .insert({
              user_id: user.id,
              user_type: 'attendee',
              rekognition_face_id: additionalResult.FaceRecords[0].Face?.FaceId || '',
              source: 'initial_scan',
              confidence: additionalResult.FaceRecords[0].Face?.Confidence || 0,
              is_primary: false,
              is_active: true,
              metadata: {
                capture_mode: 'guided_5_pose',
                pose_index: i + 1,
              },
            });
        }
      } catch (err) {
        // Continue even if additional images fail
        console.warn(`Failed to index additional face angle ${i + 1}:`, err);
      }
    }

    // Mark as indexed in backfill status (if table exists)
    try {
      await serviceClient
        .from('face_indexing_backfill_status')
        .upsert({
          attendee_id: attendeeId,
          rekognition_face_id: rekognitionFaceId,
          indexed_in_global_collection: true,
          indexed_at: new Date().toISOString(),
        }, {
          onConflict: 'attendee_id,rekognition_face_id',
        });
    } catch (err) {
      // Table might not exist yet, that's okay
      console.warn('Could not update backfill status:', err);
    }

    // Search for matching photos across all events
    let matchCount = 0;
    try {
      // Get all event collections
      const { data: events } = await serviceClient
        .from('events')
        .select('id')
        .eq('face_recognition_enabled', true);

      if (events && events.length > 0) {
        // For each event, search for matches
        for (const event of events) {
          try {
            const { response: searchResult } = await searchEventCollectionWithFallback(
              event.id,
              imageBuffer,
              100,
              90
            );
            if (searchResult.FaceMatches) {
              matchCount += searchResult.FaceMatches.length;
            }
          } catch {
            // Collection might not exist for this event
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Error searching for matches:', error);
      // Don't fail the registration if search fails
    }

    return NextResponse.json({
      success: true,
      faceId: rekognitionFaceId,
      confidence: faceRecord.Face?.Confidence,
      matchCount,
    });

  } catch (error) {
    console.error('Face registration error:', error);
    const mappedError = mapRekognitionError(error);
    if (mappedError) {
      return NextResponse.json(
        { error: mappedError.error, code: mappedError.code },
        { status: mappedError.status }
      );
    }
    const message = String((error as any)?.message || '');
    if (message.toLowerCase().includes('supabase service role key')) {
      return NextResponse.json(
        { error: 'Server configuration is incomplete for face registration.', code: 'SERVER_CONFIG_MISSING' },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to register face. Please try again.' },
      { status: 500 }
    );
  }
}

