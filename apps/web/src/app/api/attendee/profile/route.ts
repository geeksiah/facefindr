export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// GET ATTENDEE PROFILE
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an attendee
    const userType = user.user_metadata?.user_type;
    if (userType !== 'attendee') {
      return NextResponse.json({ error: 'Not an attendee account' }, { status: 403 });
    }

    // Get attendee profile
    const { data: attendee, error } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !attendee) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if user has a face profile
    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('id')
      .eq('attendee_id', user.id);

    // Get stats
    const { count: totalPhotos } = await supabase
      .from('entitlements')
      .select('*', { count: 'exact', head: true })
      .eq('attendee_id', user.id);

    // Count unique events from consents
    const { data: consents } = await supabase
      .from('attendee_consents')
      .select('event_id')
      .eq('attendee_id', user.id);

    const uniqueEvents = new Set(consents?.map(c => c.event_id) || []);

    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', user.id)
        .eq('following_type', 'attendee')
        .eq('status', 'active'),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user.id)
        .eq('status', 'active'),
    ]);

    return NextResponse.json({
      id: attendee.id,
      displayName: attendee.display_name,
      email: attendee.email,
      faceTag: attendee.face_tag,
      profilePhotoUrl: attendee.profile_photo_url,
      hasFaceProfile: (faceProfiles?.length || 0) > 0,
      lastFaceRefresh: attendee.last_face_refresh,
      createdAt: attendee.created_at,
      totalPhotos: totalPhotos || 0,
      totalEvents: uniqueEvents.size,
      followersCount: followersCount || 0,
      followingCount: followingCount || attendee.following_count || 0,
    });

  } catch (error) {
    console.error('Failed to get attendee profile:', error);
    return NextResponse.json(
      { error: 'Failed to load profile' },
      { status: 500 }
    );
  }
}

// ============================================
// UPDATE ATTENDEE PROFILE
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userType = user.user_metadata?.user_type;
    if (userType !== 'attendee') {
      return NextResponse.json({ error: 'Not an attendee account' }, { status: 403 });
    }

    const { displayName } = await request.json();

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length < 1) {
        return NextResponse.json({ error: 'Invalid display name' }, { status: 400 });
      }

      const { error } = await serviceClient
        .from('attendees')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to update profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }
    }

    // Return updated profile
    const { data: attendee } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', user.id)
      .single();

    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('id')
      .eq('attendee_id', user.id);

    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', user.id)
        .eq('following_type', 'attendee')
        .eq('status', 'active'),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user.id)
        .eq('status', 'active'),
    ]);

    return NextResponse.json({
      id: attendee?.id,
      displayName: attendee?.display_name,
      email: attendee?.email,
      faceTag: attendee?.face_tag,
      profilePhotoUrl: attendee?.profile_photo_url,
      hasFaceProfile: (faceProfiles?.length || 0) > 0,
      lastFaceRefresh: attendee?.last_face_refresh,
      createdAt: attendee?.created_at,
      totalPhotos: 0,
      totalEvents: 0,
      followersCount: followersCount || 0,
      followingCount: followingCount || attendee?.following_count || 0,
    });

  } catch (error) {
    console.error('Failed to update attendee profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

