export const dynamic = 'force-dynamic';

import { DeleteFacesCommand } from '@aws-sdk/client-rekognition';
import { NextResponse } from 'next/server';

import { rekognitionClient, ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET FACE PROFILE STATUS
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: faceProfiles, error } = await supabase
      .from('attendee_face_profiles')
      .select('*')
      .eq('attendee_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to get face profile' }, { status: 500 });
    }

    if (!faceProfiles || faceProfiles.length === 0) {
      return NextResponse.json({
        hasFaceProfile: false,
      });
    }

    const primaryProfile = faceProfiles.find(p => p.is_primary) || faceProfiles[0];

    return NextResponse.json({
      hasFaceProfile: true,
      profileId: primaryProfile.id,
      createdAt: primaryProfile.created_at,
      source: primaryProfile.source,
      confidence: primaryProfile.confidence,
    });

  } catch (error) {
    console.error('Failed to get face profile:', error);
    return NextResponse.json(
      { error: 'Failed to load face profile' },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE FACE PROFILE
// ============================================

export async function DELETE() {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all face profiles for this user
    const { data: faceProfiles, error: fetchError } = await supabase
      .from('attendee_face_profiles')
      .select('rekognition_face_id')
      .eq('attendee_id', user.id);

    if (fetchError) {
      console.error('Failed to fetch face profiles:', fetchError);
      return NextResponse.json({ error: 'Failed to delete face profile' }, { status: 500 });
    }

    // Delete faces from Rekognition
    if (faceProfiles && faceProfiles.length > 0) {
      const faceIds = faceProfiles.map(p => p.rekognition_face_id);

      try {
        const deleteCommand = new DeleteFacesCommand({
          CollectionId: ATTENDEE_COLLECTION_ID,
          FaceIds: faceIds,
        });

        await rekognitionClient.send(deleteCommand);
      } catch (error) {
        console.error('Failed to delete faces from Rekognition:', error);
        // Continue with database deletion even if Rekognition fails
      }
    }

    // Delete face profiles from database
    const { error: deleteError } = await serviceClient
      .from('attendee_face_profiles')
      .delete()
      .eq('attendee_id', user.id);

    if (deleteError) {
      console.error('Failed to delete face profiles from database:', deleteError);
      return NextResponse.json({ error: 'Failed to delete face profile' }, { status: 500 });
    }

    // Update attendee record
    await serviceClient
      .from('attendees')
      .update({ last_face_refresh: null })
      .eq('id', user.id);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete face profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete face profile' },
      { status: 500 }
    );
  }
}

