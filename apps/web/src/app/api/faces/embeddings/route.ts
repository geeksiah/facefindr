import { IndexFacesCommand } from '@aws-sdk/client-rekognition';
import { NextRequest, NextResponse } from 'next/server';

import { rekognitionClient, ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// SUPPLEMENTARY EMBEDDINGS API
// Add additional face embeddings to improve matching accuracy
// ============================================

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { image, source = 'event_scan', eventId } = body;

    if (!image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    // Determine user type
    const serviceClient = createServiceClient();
    let userType: 'attendee' | 'photographer' = 'attendee';

    const { data: attendee } = await serviceClient
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!attendee) {
      const { data: photographer } = await serviceClient
        .from('photographers')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!photographer) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      userType = 'photographer';
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(image, 'base64');

    // Index the face
    const indexCommand = new IndexFacesCommand({
      CollectionId: ATTENDEE_COLLECTION_ID,
      Image: { Bytes: imageBuffer },
      ExternalImageId: `${user.id}_supplementary_${Date.now()}`,
      MaxFaces: 1,
      QualityFilter: 'MEDIUM',
      DetectionAttributes: ['DEFAULT'],
    });

    const indexResult = await rekognitionClient.send(indexCommand);

    if (!indexResult.FaceRecords || indexResult.FaceRecords.length === 0) {
      return NextResponse.json(
        { error: 'No face detected in image' },
        { status: 400 }
      );
    }

    const faceRecord = indexResult.FaceRecords[0];
    const rekognitionFaceId = faceRecord.Face?.FaceId;
    const confidence = faceRecord.Face?.Confidence || 0;

    if (!rekognitionFaceId) {
      return NextResponse.json(
        { error: 'Failed to process face' },
        { status: 500 }
      );
    }

    // Only store if confidence is high enough
    if (confidence < 80) {
      return NextResponse.json(
        { error: 'Image quality too low. Please try again with better lighting.' },
        { status: 400 }
      );
    }

    // Store the embedding
    const { data: embedding, error: insertError } = await serviceClient
      .from('user_face_embeddings')
      .upsert({
        user_id: user.id,
        user_type: userType,
        rekognition_face_id: rekognitionFaceId,
        source,
        event_id: eventId || null,
        confidence,
        is_primary: false,
        is_active: true,
      }, {
        onConflict: 'user_id,rekognition_face_id',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store embedding:', insertError);
      return NextResponse.json(
        { error: 'Failed to save face embedding' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      embeddingId: embedding.id,
      confidence,
    });

  } catch (error) {
    console.error('Add embedding error:', error);
    return NextResponse.json(
      { error: 'Failed to add embedding' },
      { status: 500 }
    );
  }
}

// Get all embeddings for current user
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    const { data: embeddings, error } = await serviceClient
      .from('user_face_embeddings')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch embeddings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch embeddings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      embeddings,
      count: embeddings.length,
      primaryCount: embeddings.filter(e => e.is_primary).length,
    });

  } catch (error) {
    console.error('Get embeddings error:', error);
    return NextResponse.json(
      { error: 'Failed to get embeddings' },
      { status: 500 }
    );
  }
}

// Delete an embedding
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const embeddingId = searchParams.get('id');

    if (!embeddingId) {
      return NextResponse.json({ error: 'Embedding ID required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Soft delete - mark as inactive
    const { error } = await serviceClient
      .from('user_face_embeddings')
      .update({ is_active: false })
      .eq('id', embeddingId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to delete embedding:', error);
      return NextResponse.json(
        { error: 'Failed to delete embedding' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete embedding error:', error);
    return NextResponse.json(
      { error: 'Failed to delete embedding' },
      { status: 500 }
    );
  }
}
