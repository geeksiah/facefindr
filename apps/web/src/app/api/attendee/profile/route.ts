export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

async function resolveAttendeeProfileByUser(supabase: any, userId: string) {
  const byUserId = await supabase
    .from('attendees')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
  }

  const fallback = await supabase
    .from('attendees')
    .select('*')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data,
    error: fallback.error,
  };
}

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
    const { data: attendee, error } = await resolveAttendeeProfileByUser(supabase, user.id);

    if (error || !attendee) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const followTargetIds = uniqueStringValues([(attendee as any).user_id || attendee.id, attendee.id]);

    // Check if user has a face profile
    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('id')
      .eq('attendee_id', attendee.id);

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

    let followersCountQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_type', 'attendee')
      .eq('status', 'active');
    let followingCountQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      followersCountQuery = followersCountQuery.eq('following_id', followTargetIds[0]);
      followingCountQuery = followingCountQuery.eq('follower_id', followTargetIds[0]);
    } else {
      followersCountQuery = followersCountQuery.in('following_id', followTargetIds);
      followingCountQuery = followingCountQuery.in('follower_id', followTargetIds);
    }
    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      followersCountQuery,
      followingCountQuery,
    ]);

    return NextResponse.json({
      id: attendee.id,
      displayName: attendee.display_name,
      email: attendee.email,
      faceTag: attendee.face_tag,
      profilePhotoUrl: attendee.profile_photo_url,
      countryCode: (attendee as any).country_code || null,
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

    const { data: attendeeProfile, error: attendeeError } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id
    );
    if (attendeeError || !attendeeProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const profileId = attendeeProfile.id;
    const followTargetIds = uniqueStringValues([
      (attendeeProfile as any).user_id || attendeeProfile.id,
      attendeeProfile.id,
    ]);

    const { displayName, countryCode } = await request.json();
    const normalizedCountryCode =
      typeof countryCode === 'string' && /^[A-Za-z]{2}$/.test(countryCode.trim())
        ? countryCode.trim().toUpperCase()
        : null;

    const updates: Record<string, any> = {};

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length < 1) {
        return NextResponse.json({ error: 'Invalid display name' }, { status: 400 });
      }
      updates.display_name = displayName.trim();
    }

    if (countryCode !== undefined) {
      if (!normalizedCountryCode) {
        return NextResponse.json({ error: 'Invalid country code' }, { status: 400 });
      }
      updates.country_code = normalizedCountryCode;
    }

    if (Object.keys(updates).length > 0) {
      const withMeta = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      const { error } = await serviceClient
        .from('attendees')
        .update(withMeta)
        .eq('id', profileId);

      if (error?.code === '42703' && String(error.message || '').includes('country_code')) {
        const legacyUpdates: Record<string, any> = { ...withMeta };
        delete legacyUpdates.country_code;
        const fallback = await serviceClient
          .from('attendees')
          .update(legacyUpdates)
          .eq('id', profileId);
        if (fallback.error) {
          console.error('Failed to update profile:', fallback.error);
          return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
        }
      } else if (error) {
        console.error('Failed to update profile:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }

      if (normalizedCountryCode) {
        await serviceClient.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...(user.user_metadata || {}),
            country_code: normalizedCountryCode,
          },
        }).catch(() => {});
      }
    }

    // Return updated profile
    const { data: attendee } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', profileId)
      .single();

    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('id')
      .eq('attendee_id', profileId);

    let followersCountQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_type', 'attendee')
      .eq('status', 'active');
    let followingCountQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      followersCountQuery = followersCountQuery.eq('following_id', followTargetIds[0]);
      followingCountQuery = followingCountQuery.eq('follower_id', followTargetIds[0]);
    } else {
      followersCountQuery = followersCountQuery.in('following_id', followTargetIds);
      followingCountQuery = followingCountQuery.in('follower_id', followTargetIds);
    }
    const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
      followersCountQuery,
      followingCountQuery,
    ]);

    return NextResponse.json({
      id: attendee?.id,
      displayName: attendee?.display_name,
      email: attendee?.email,
      faceTag: attendee?.face_tag,
      profilePhotoUrl: attendee?.profile_photo_url,
      countryCode: (attendee as any)?.country_code || null,
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

