export const dynamic = 'force-dynamic';

/**
 * Drop-In Discovery API
 * 
 * Allows attendees to discover drop-in photos matched to their profile.
 * This route is credit-driven and does not gate discovery by premium plans.
 */

import { NextRequest, NextResponse } from 'next/server';

import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createStorageSignedUrl } from '@/lib/storage/provider';
import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userType = normalizeUserType(user.user_metadata?.user_type);
    if (userType === 'creator') {
      return NextResponse.json(
        { error: 'Drop-in discovery is only available for attendee profiles' },
        { status: 403 }
      );
    }

    // Get attendee profile (use service client to bypass RLS)
    const serviceClient = createServiceClient();
    const { data: attendee } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id,
      user.email
    );

    if (!attendee) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }

    // Get drop-in matches for this user
    const { data: matches } = await supabase
      .from('drop_in_matches')
      .select(`
        id,
        confidence,
        verification_status,
        drop_in_photos (
          id,
          storage_path,
          thumbnail_path,
          original_filename,
          uploaded_at,
          location_name,
          uploader_id,
          is_gifted,
          gift_message,
          uploader:uploader_id (
            id,
            display_name,
            face_tag,
            profile_photo_url
          )
        )
      `)
      .eq('matched_attendee_id', attendee.id)
      .in('verification_status', ['confirmed', 'pending'])
      .order('created_at', { ascending: false });

    const filteredMatches = matches || [];

    const matchIds = filteredMatches.map((match) => match.id);
    let notificationByMatchId = new Map<string, { id: string; userAction: string | null }>();
    if (matchIds.length > 0) {
      const { data: notifications } = await supabase
        .from('drop_in_notifications')
        .select('id, drop_in_match_id, recipient_decision')
        .eq('recipient_id', attendee.id)
        .in('drop_in_match_id', matchIds);

      notificationByMatchId = new Map(
        (notifications || []).map((notification: any) => [
          notification.drop_in_match_id,
          {
            id: notification.id,
            userAction: notification.recipient_decision || null,
          },
        ])
      );
    }

    // Get signed URLs for photos
    const photosWithUrls = await Promise.all(
      filteredMatches.map(async (match) => {
        const photo = match.drop_in_photos as any;
        const path = photo.thumbnail_path || photo.storage_path;

        const signedUrl = await createStorageSignedUrl('media', path, 3600, {
          supabaseClient: supabase,
        });

        return {
          matchId: match.id,
          notificationId: notificationByMatchId.get(match.id)?.id || null,
          connectionDecision: notificationByMatchId.get(match.id)?.userAction || null,
          photoId: photo.id,
          thumbnailUrl: signedUrl || null,
          confidence: match.confidence,
          uploadedAt: photo.uploaded_at,
          locationName: photo.location_name,
          uploader: photo.uploader,
          isGifted: photo.is_gifted,
          giftMessage: photo.is_gifted && photo.gift_message ? photo.gift_message : null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      photos: photosWithUrls,
      count: photosWithUrls.length,
    });

  } catch (error) {
    console.error('Drop-in discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover drop-in photos' },
      { status: 500 }
    );
  }
}
