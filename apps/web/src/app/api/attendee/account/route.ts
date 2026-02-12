export const dynamic = 'force-dynamic';

import { DeleteFacesCommand } from '@aws-sdk/client-rekognition';
import { NextResponse } from 'next/server';

import { rekognitionClient, ATTENDEE_COLLECTION_ID } from '@/lib/aws/rekognition';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// DELETE ATTENDEE ACCOUNT
// ============================================

export async function DELETE() {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Delete face profiles from Rekognition
    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('rekognition_face_id')
      .eq('attendee_id', user.id);

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
        // Continue with deletion even if Rekognition fails
      }
    }

    // 2. Delete from database tables (RLS will handle most, but use service client for safety)
    // The database has ON DELETE CASCADE for most relations

    // Delete face profiles
    await serviceClient
      .from('attendee_face_profiles')
      .delete()
      .eq('attendee_id', user.id);

    // Delete consents
    await serviceClient
      .from('attendee_consents')
      .delete()
      .eq('attendee_id', user.id);

    // Update entitlements to anonymize (keep for photographer records)
    await serviceClient
      .from('entitlements')
      .update({ attendee_id: null })
      .eq('attendee_id', user.id);

    // Update transactions to anonymize
    await serviceClient
      .from('transactions')
      .update({ attendee_id: null })
      .eq('attendee_id', user.id);

    // Delete download logs
    await serviceClient
      .from('download_logs')
      .delete()
      .eq('attendee_id', user.id);

    // Delete attendee record
    await serviceClient
      .from('attendees')
      .delete()
      .eq('id', user.id);

    // 3. Delete the auth user (this should be last)
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      // If we can't delete the auth user, we may need admin API
      // For now, just sign them out
      console.error('Failed to delete auth user:', deleteUserError);
    }

    // Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}

