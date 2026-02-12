export const dynamic = 'force-dynamic';

/**
 * Drop-In Photo Processing API
 * 
 * Processes drop-in photos after payment confirmation
 * - Detects faces using AWS Rekognition
 * - Matches against attendee FaceTags in global collection
 * - Creates notifications for matches
 */

import { NextRequest, NextResponse } from 'next/server';

import { detectFaces } from '@/lib/aws/rekognition';
import { searchDropInFaces } from '@/lib/aws/rekognition-drop-in';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { dropInPhotoId } = await request.json();

    if (!dropInPhotoId) {
      return NextResponse.json({ error: 'dropInPhotoId is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Get drop-in photo
    const { data: dropInPhoto, error: photoError } = await supabase
      .from('drop_in_photos')
      .select('*')
      .eq('id', dropInPhotoId)
      .single();

    if (photoError || !dropInPhoto) {
      return NextResponse.json({ error: 'Drop-in photo not found' }, { status: 404 });
    }

    // Check payment status
    if (dropInPhoto.upload_payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not confirmed' },
        { status: 400 }
      );
    }

    // Update processing status
    await supabase
      .from('drop_in_photos')
      .update({ face_processing_status: 'processing' })
      .eq('id', dropInPhotoId);

    // Get photo from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('media')
      .download(dropInPhoto.storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from('drop_in_photos')
        .update({ face_processing_status: 'failed' })
        .eq('id', dropInPhotoId);
      return NextResponse.json({ error: 'Failed to download photo' }, { status: 500 });
    }

    // Convert to buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);

    // Detect faces first (without indexing)
    const detectResult = await detectFaces(imageBytes);

    if (detectResult.error || !detectResult.faces || detectResult.faces.length === 0) {
      await supabase
        .from('drop_in_photos')
        .update({
          face_processing_status: 'completed',
          faces_detected: 0,
          is_discoverable: true,
        })
        .eq('id', dropInPhotoId);
      return NextResponse.json({
        success: true,
        facesDetected: 0,
        message: 'No faces detected in photo',
      });
    }

    const facesDetected = detectResult.faces.length;

    // Search for matches against all attendee FaceTags in global collection
    const searchResult = await searchDropInFaces(imageBytes, 85);

    if (searchResult.error && searchResult.error !== 'No face detected in the provided image') {
      await supabase
        .from('drop_in_photos')
        .update({
          face_processing_status: 'failed',
          faces_detected: facesDetected,
        })
        .eq('id', dropInPhotoId);
      return NextResponse.json({ error: searchResult.error }, { status: 500 });
    }

    const matches: Array<{
      attendeeId: string;
      rekognitionFaceId: string;
      confidence: number;
      boundingBox: any;
    }> = [];

    if (searchResult.matches && searchResult.matches.length > 0) {
      // Get all attendee face profiles to map rekognition_face_id to attendee_id
      const { data: faceProfiles } = await supabase
        .from('attendee_face_profiles')
        .select('attendee_id, rekognition_face_id')
        .eq('is_primary', true);

      const faceProfileMap: Map<string, string> = new Map(
        faceProfiles?.map((fp: any) => [fp.rekognition_face_id, fp.attendee_id]) || []
      );

      // Create matches and notifications
      for (const match of searchResult.matches) {
        const rekognitionFaceId = match.rekognitionFaceId;
        if (!rekognitionFaceId) continue;

        const attendeeId = faceProfileMap.get(rekognitionFaceId);
        if (!attendeeId) continue;

        // Skip if matching self
        if (attendeeId === dropInPhoto.uploader_id) {
          continue;
        }

        // Check if uploader and matched attendee are contacts
        const { data: areContacts } = await supabase.rpc('are_contacts', {
          user1_id: dropInPhoto.uploader_id,
          user2_id: attendeeId,
        });

        // Check if matched attendee has premium or if photo is gifted
        const { data: hasPremium } = await supabase.rpc('has_premium_access', {
          attendee_id: attendeeId,
        });

        // Also check if attendee is registered for any events (free discovery)
        const { data: registeredEvents } = await supabase
          .from('event_access_tokens')
          .select('event_id')
          .eq('attendee_id', attendeeId)
          .limit(1);

        const isRegisteredForEvents = (registeredEvents?.length || 0) > 0;

        // Can notify if: contacts, premium, gifted, OR registered for events (free tier)
        const canNotify = areContacts || hasPremium || dropInPhoto.is_gifted || isRegisteredForEvents;

        if (!canNotify) {
          // Skip if not contact, not premium, not gifted, and not registered for events
          continue;
        }

        // Create match record
        const { data: matchRecord, error: matchError } = await supabase
          .from('drop_in_matches')
          .insert({
            drop_in_photo_id: dropInPhotoId,
            matched_attendee_id: attendeeId,
            rekognition_face_id: rekognitionFaceId,
            confidence: match.similarity || 0,
            bounding_box: match.boundingBox,
            verification_status: (match.similarity || 0) >= 90 ? 'confirmed' : 'pending',
          })
          .select()
          .single();

        if (!matchError && matchRecord) {
          matches.push({
            attendeeId,
            rekognitionFaceId,
            confidence: match.similarity || 0,
            boundingBox: match.boundingBox,
          });

          // Create notification
          await supabase
            .from('drop_in_notifications')
            .insert({
              drop_in_photo_id: dropInPhotoId,
              drop_in_match_id: matchRecord.id,
              recipient_id: attendeeId,
              status: 'pending',
              requires_premium: !areContacts && !dropInPhoto.is_gifted && !isRegisteredForEvents,
              is_gifted: dropInPhoto.is_gifted,
              gift_message_available: dropInPhoto.is_gifted && !!dropInPhoto.gift_message,
            });

          // TODO: Send push notification via notification service
          // This would trigger a background job to send push/email notifications
        }
      }
    }

    // Update drop-in photo with processing results
    await supabase
      .from('drop_in_photos')
      .update({
        face_processing_status: 'completed',
        faces_detected: facesDetected,
        matches_found: matches.length,
        is_discoverable: true, // Enable discovery after processing
      })
      .eq('id', dropInPhotoId);

    return NextResponse.json({
      success: true,
      facesDetected,
      matchesFound: matches.length,
      message: matches.length > 0
        ? `Found ${matches.length} match(es). Notifications sent.`
        : 'Photo processed. No matches found yet.',
    });

  } catch (error) {
    console.error('Drop-in processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process drop-in photo' },
      { status: 500 }
    );
  }
}

