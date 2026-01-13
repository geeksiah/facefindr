import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { indexFacesFromImage, isRekognitionConfigured, createEventCollection } from '@/lib/aws/rekognition';

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

    const supabase = createClient();

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify event ownership and face recognition is enabled
    const { data: event } = await supabase
      .from('events')
      .select('photographer_id, face_recognition_enabled, face_ops_used, face_ops_limit')
      .eq('id', eventId)
      .single();

    if (!event || event.photographer_id !== user.id) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Check if face recognition is enabled
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

    // Check face ops quota
    if (event.face_ops_used >= event.face_ops_limit) {
      return NextResponse.json({
        success: false,
        error: 'Face operations quota exceeded',
        facesIndexed: 0,
      });
    }

    // Get the media record
    const { data: media } = await supabase
      .from('media')
      .select('storage_path, faces_indexed')
      .eq('id', mediaId)
      .eq('event_id', eventId)
      .single();

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

    // Download the image from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('media')
      .download(media.storage_path);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download image' },
        { status: 500 }
      );
    }

    // Convert to Uint8Array for Rekognition
    const arrayBuffer = await fileData.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);

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

      const { error: insertError } = await supabase
        .from('face_embeddings')
        .insert(faceRecords);

      if (insertError) {
        console.error('Error storing face records:', insertError);
      }
    }

    // Update media record
    await supabase
      .from('media')
      .update({
        faces_detected: facesDetected,
        faces_indexed: true,
      })
      .eq('id', mediaId);

    // Update face ops counter
    await supabase
      .from('events')
      .update({
        face_ops_used: event.face_ops_used + facesDetected,
      })
      .eq('id', eventId);

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
