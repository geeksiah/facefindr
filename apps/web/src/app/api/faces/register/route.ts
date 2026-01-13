import { NextRequest, NextResponse } from 'next/server';
import { IndexFacesCommand, SearchFacesByImageCommand } from '@aws-sdk/client-rekognition';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { rekognitionClient, ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';

// ============================================
// FACE REGISTRATION API
// Registers an attendee's face for photo matching
// Supports multiple images from guided scan for better accuracy
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an attendee
    const userType = user.user_metadata?.user_type;
    if (userType !== 'attendee') {
      return NextResponse.json(
        { error: 'Only attendees can register face profiles' },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    // Support both single image and multiple images from guided scan
    const images: string[] = body.images || (body.image ? [body.image] : []);
    const primaryImage = body.primaryImage || images[0];

    if (!primaryImage) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    // Convert base64 to buffer (use primary image for initial registration)
    const imageBuffer = Buffer.from(primaryImage, 'base64');

    // Check if face can be detected
    const indexCommand = new IndexFacesCommand({
      CollectionId: ATTENDEE_COLLECTION_ID,
      Image: { Bytes: imageBuffer },
      ExternalImageId: user.id,
      MaxFaces: 1,
      QualityFilter: 'HIGH',
      DetectionAttributes: ['ALL'],
    });

    const indexResult = await rekognitionClient.send(indexCommand);

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
    const serviceClient = createServiceClient();

    // Remove any existing face profiles (we keep only one primary)
    await serviceClient
      .from('attendee_face_profiles')
      .delete()
      .eq('attendee_id', user.id);

    // Insert new face profile
    const { error: insertError } = await serviceClient
      .from('attendee_face_profiles')
      .insert({
        attendee_id: user.id,
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

    // Update attendee's last_face_refresh timestamp
    await serviceClient
      .from('attendees')
      .update({ last_face_refresh: new Date().toISOString() })
      .eq('id', user.id);

    // If we have additional images from guided scan, index them too
    // This improves matching accuracy by having multiple angles
    const additionalImages = images.slice(1);
    for (let i = 0; i < additionalImages.length; i++) {
      try {
        const additionalBuffer = Buffer.from(additionalImages[i], 'base64');
        const additionalCommand = new IndexFacesCommand({
          CollectionId: ATTENDEE_COLLECTION_ID,
          Image: { Bytes: additionalBuffer },
          ExternalImageId: `${user.id}_angle_${i + 1}`,
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
              attendee_id: user.id,
              rekognition_face_id: additionalResult.FaceRecords[0].Face?.FaceId || '',
              is_primary: false,
              source: 'initial_scan',
              confidence: additionalResult.FaceRecords[0].Face?.Confidence || 0,
            });
        }
      } catch (err) {
        // Continue even if additional images fail
        console.warn(`Failed to index additional face angle ${i + 1}:`, err);
      }
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
          const collectionId = `facefindr-event-${event.id}`;
          
          try {
            const searchCommand = new SearchFacesByImageCommand({
              CollectionId: collectionId,
              Image: { Bytes: imageBuffer },
              MaxFaces: 100,
              FaceMatchThreshold: 90,
            });

            const searchResult = await rekognitionClient.send(searchCommand);
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
    return NextResponse.json(
      { error: 'Failed to register face. Please try again.' },
      { status: 500 }
    );
  }
}
