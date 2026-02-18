export const dynamic = 'force-dynamic';

/**
 * Drop-In Discovery API
 * 
 * Allows premium users to discover drop-in photos of themselves
 * from people outside their contacts
 */

import { NextRequest, NextResponse } from 'next/server';

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
    const { data: attendee } = await serviceClient
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!attendee) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }

    // Check premium access OR if user is registered for events (free tier)
    const { data: subscription } = await supabase
      .from('attendee_subscriptions')
      .select('plan_code, status, can_discover_non_contacts')
      .eq('attendee_id', attendee.id)
      .eq('status', 'active')
      .single();

    const hasPremium = subscription?.can_discover_non_contacts || false;

    // Check if user is registered for any events (free tier allows discovery from registered events)
    // Check entitlements table which links attendees to events
    const { count: registeredEventsCount } = await supabase
      .from('entitlements')
      .select('*', { count: 'exact', head: true })
      .eq('attendee_id', attendee.id);

    const isRegisteredForEvents = (registeredEventsCount || 0) > 0;

    if (!hasPremium && !isRegisteredForEvents) {
      return NextResponse.json(
        { 
          error: 'Premium subscription or event registration required to discover non-contact photos',
          requiresPremium: true,
        },
        { status: 403 }
      );
    }

    // Get user's contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('contact_id')
      .eq('user_id', attendee.id)
      .eq('contact_type', 'mutual');

    const contactIds = contacts?.map(c => c.contact_id) || [];

    // Get drop-in matches for this user
    // Free tier: only from contacts or registered events
    // Premium: all matches
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

    // Filter based on subscription tier
    let filteredMatches = matches || [];
    
    if (!hasPremium) {
      // Free tier: only from contacts or gifted
      filteredMatches = matches?.filter(match => {
        const photo = match.drop_in_photos as any;
        const uploaderId = photo?.uploader_id;
        return contactIds.includes(uploaderId) || photo?.is_gifted;
      }) || [];
    }
    // Premium users see all matches (no filtering needed)

    const matchIds = filteredMatches.map((match) => match.id);
    let notificationByMatchId = new Map<string, { id: string; userAction: string | null }>();
    if (matchIds.length > 0) {
      const { data: notifications } = await supabase
        .from('drop_in_notifications')
        .select('id, drop_in_match_id, user_action')
        .eq('recipient_id', attendee.id)
        .in('drop_in_match_id', matchIds);

      notificationByMatchId = new Map(
        (notifications || []).map((notification: any) => [
          notification.drop_in_match_id,
          {
            id: notification.id,
            userAction: notification.user_action || null,
          },
        ])
      );
    }

    // Get signed URLs for photos
    const photosWithUrls = await Promise.all(
      filteredMatches.map(async (match) => {
        const photo = match.drop_in_photos as any;
        const path = photo.thumbnail_path || photo.storage_path;

        const { data: urlData } = await supabase.storage
          .from('media')
          .createSignedUrl(path, 3600);

        return {
          matchId: match.id,
          notificationId: notificationByMatchId.get(match.id)?.id || null,
          connectionDecision: notificationByMatchId.get(match.id)?.userAction || null,
          photoId: photo.id,
          thumbnailUrl: urlData?.signedUrl || null,
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
