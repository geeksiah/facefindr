export const dynamic = 'force-dynamic';

import { DeleteFacesCommand } from '@aws-sdk/client-rekognition';
import { NextResponse } from 'next/server';

import { rekognitionClient, ATTENDEE_COLLECTION_ID, LEGACY_ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET FACE PROFILE STATUS
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: attendeeProfile } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    const attendeeId = attendeeProfile?.id as string | undefined;
    if (!attendeeId) {
      return NextResponse.json({ hasFaceProfile: false });
    }

    const { data: faceProfiles, error } = await supabase
      .from('attendee_face_profiles')
      .select('*')
      .eq('attendee_id', attendeeId);

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

    const { data: attendeeProfile } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    const attendeeId = attendeeProfile?.id as string | undefined;
    if (!attendeeId) {
      return NextResponse.json({ success: true });
    }

    // Get all face profiles for this user
    const { data: faceProfiles, error: fetchError } = await supabase
      .from('attendee_face_profiles')
      .select('rekognition_face_id')
      .eq('attendee_id', attendeeId);

    if (fetchError) {
      console.error('Failed to fetch face profiles:', fetchError);
      return NextResponse.json({ error: 'Failed to delete face profile' }, { status: 500 });
    }

    // Delete faces from Rekognition
    if (faceProfiles && faceProfiles.length > 0) {
      const faceIds = faceProfiles.map(p => p.rekognition_face_id);

      const collectionIds = [ATTENDEE_COLLECTION_ID, LEGACY_ATTENDEE_COLLECTION_ID];
      for (const collectionId of collectionIds) {
        try {
          const deleteCommand = new DeleteFacesCommand({
            CollectionId: collectionId,
            FaceIds: faceIds,
          });
          await rekognitionClient.send(deleteCommand);
        } catch (error: any) {
          if (error?.name === 'ResourceNotFoundException') {
            continue;
          }
          console.error(`Failed to delete faces from Rekognition (${collectionId}):`, error);
        }
      }
    }

    // Delete face profiles from database
    const { error: deleteError } = await serviceClient
      .from('attendee_face_profiles')
      .delete()
      .eq('attendee_id', attendeeId);

    if (deleteError) {
      console.error('Failed to delete face profiles from database:', deleteError);
      return NextResponse.json({ error: 'Failed to delete face profile' }, { status: 500 });
    }

    // Update attendee record
    await serviceClient
      .from('attendees')
      .update({ last_face_refresh: null })
      .eq('id', attendeeId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete face profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete face profile' },
      { status: 500 }
    );
  }
}

