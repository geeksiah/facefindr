export const dynamic = 'force-dynamic';

/**
 * Follow API
 * 
 * Manage follows for creators.
 */

import { NextRequest, NextResponse } from 'next/server';

import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : await createClient();
}

function getOptionalServiceClient() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function getFollowingTypeFilters(followingType: 'creator' | 'attendee') {
  return followingType === 'creator' ? ['creator', 'photographer'] : ['attendee'];
}

function applyFollowingIdFilter(query: any, followingIds: string[]) {
  if (followingIds.length === 1) {
    return query.eq('following_id', followingIds[0]);
  }
  return query.in('following_id', followingIds);
}

function addProfileLookupEntry(map: Map<string, any>, profile: any) {
  if (!profile?.id) return;
  map.set(profile.id, profile);
  const userId = typeof profile.user_id === 'string' ? profile.user_id : null;
  if (userId) {
    map.set(userId, profile);
  }
}

async function fetchAttendeeProfilesByIdentifiers(supabase: any, identifiers: string[]) {
  const ids = uniqueStringValues(identifiers);
  const lookup = new Map<string, any>();
  if (!ids.length) return lookup;

  const idRows = await supabase
    .from('attendees')
    .select('id, user_id, display_name, face_tag, profile_photo_url, public_profile_slug, email')
    .in('id', ids);

  if (!idRows.error && Array.isArray(idRows.data)) {
    for (const row of idRows.data) addProfileLookupEntry(lookup, row);
  } else if (isMissingColumnError(idRows.error, 'user_id')) {
    const fallbackRows = await supabase
      .from('attendees')
      .select('id, display_name, face_tag, profile_photo_url, public_profile_slug, email')
      .in('id', ids);
    if (Array.isArray(fallbackRows.data)) {
      for (const row of fallbackRows.data) addProfileLookupEntry(lookup, { ...row, user_id: row.id });
    }
    return lookup;
  }

  const byUserRows = await supabase
    .from('attendees')
    .select('id, user_id, display_name, face_tag, profile_photo_url, public_profile_slug, email')
    .in('user_id', ids);
  if (Array.isArray(byUserRows.data)) {
    for (const row of byUserRows.data) addProfileLookupEntry(lookup, row);
  }

  return lookup;
}

async function fetchCreatorProfilesByIdentifiers(supabase: any, identifiers: string[]) {
  const ids = uniqueStringValues(identifiers);
  const lookup = new Map<string, any>();
  if (!ids.length) return lookup;

  const idRows = await supabase
    .from('photographers')
    .select('id, user_id, display_name, face_tag, profile_photo_url, bio, public_profile_slug, email')
    .in('id', ids);

  if (!idRows.error && Array.isArray(idRows.data)) {
    for (const row of idRows.data) addProfileLookupEntry(lookup, row);
  } else if (isMissingColumnError(idRows.error, 'user_id')) {
    const fallbackRows = await supabase
      .from('photographers')
      .select('id, display_name, face_tag, profile_photo_url, bio, public_profile_slug, email')
      .in('id', ids);
    if (Array.isArray(fallbackRows.data)) {
      for (const row of fallbackRows.data) addProfileLookupEntry(lookup, { ...row, user_id: row.id });
    }
    return lookup;
  }

  const byUserRows = await supabase
    .from('photographers')
    .select('id, user_id, display_name, face_tag, profile_photo_url, bio, public_profile_slug, email')
    .in('user_id', ids);
  if (Array.isArray(byUserRows.data)) {
    for (const row of byUserRows.data) addProfileLookupEntry(lookup, row);
  }

  return lookup;
}

async function resolveProfileIdByUser(
  supabase: any,
  table: 'attendees' | 'photographers',
  userId: string
) {
  const byUserId = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .single();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
  }

  return supabase
    .from(table)
    .select('id')
    .eq('id', userId)
    .single();
}

async function getAttendeeByIdentifier(supabase: any, identifier: string) {
  const withUserId = await supabase
    .from('attendees')
    .select('id, is_public_profile, public_profile_slug, user_id, allow_follows')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier},user_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (
    !withUserId.error ||
    (!isMissingColumnError(withUserId.error, 'user_id') &&
      !isMissingColumnError(withUserId.error, 'allow_follows'))
  ) {
    return withUserId;
  }

  const fallback = await supabase
    .from('attendees')
    .select('id, is_public_profile, public_profile_slug')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  return {
    data: fallback.data
      ? {
          ...fallback.data,
          user_id: fallback.data.id,
          allow_follows: true,
        }
      : fallback.data,
    error: fallback.error,
  };
}

async function getCreatorByIdentifier(supabase: any, identifier: string) {
  const withUserId = await supabase
    .from('photographers')
    .select('id, is_public_profile, public_profile_slug, user_id, allow_follows')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier},user_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (
    !withUserId.error ||
    (!isMissingColumnError(withUserId.error, 'user_id') &&
      !isMissingColumnError(withUserId.error, 'allow_follows'))
  ) {
    return withUserId;
  }

  const fallback = await supabase
    .from('photographers')
    .select('id, is_public_profile, public_profile_slug')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  return {
    data: fallback.data
      ? {
          ...fallback.data,
          user_id: fallback.data.id,
          allow_follows: true,
        }
      : fallback.data,
    error: fallback.error,
  };
}

async function resolveFollowingUserId(
  supabase: any,
  targetType: 'creator' | 'attendee',
  identifier: string
) {
  const tryResolve = async (type: 'creator' | 'attendee') => {
    if (type === 'attendee') {
      const { data, error } = await getAttendeeByIdentifier(supabase, identifier);
      if (error || !data) return { data: null, error };
      return {
        data: {
          profileId: data.id,
          userId: (data as any).user_id || data.id,
          isPublicProfile: Boolean((data as any).is_public_profile),
          allowFollows: (data as any).allow_follows !== false,
          resolvedType: 'attendee' as const,
        },
        error: null,
      };
    }

    const { data, error } = await getCreatorByIdentifier(supabase, identifier);
    if (error || !data) return { data: null, error };
    return {
      data: {
        profileId: data.id,
        userId: (data as any).user_id || data.id,
        isPublicProfile: Boolean((data as any).is_public_profile),
        allowFollows: (data as any).allow_follows !== false,
        resolvedType: 'creator' as const,
      },
      error: null,
    };
  };

  const primary = await tryResolve(targetType);
  if (primary.data) return primary;

  // Fallback for legacy clients passing wrong targetType.
  const fallbackType = targetType === 'creator' ? 'attendee' : 'creator';
  const fallback = await tryResolve(fallbackType);
  if (fallback.data) return fallback;

  return primary;
}

async function getActiveFollowerCount(
  supabase: any,
  followingIds: string[],
  followingType: string
) {
  if (!followingIds.length) return 0;
  const typeFilter = getFollowingTypeFilters(followingType as 'creator' | 'attendee');
  let query = supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .in('following_type', typeFilter)
    .eq('status', 'active');

  if (followingIds.length === 1) {
    query = query.eq('following_id', followingIds[0]);
  } else {
    query = query.in('following_id', followingIds);
  }

  const { count } = await query;
  return count || 0;
}

// POST - Follow a creator
export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const serviceClient = getOptionalServiceClient();
    const lookupClient = serviceClient ?? supabase;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId, attendeeId, targetId, targetType } = body;
    let resolvedTargetType =
      targetType === 'attendee'
        ? 'attendee'
        : targetType === 'creator' || targetType === 'photographer'
        ? 'creator'
        : attendeeId
        ? 'attendee'
        : 'creator';
    const resolvedTargetId =
      targetId ||
      (resolvedTargetType === 'attendee' ? attendeeId : photographerId);

    if (!resolvedTargetId) {
      return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
    }

    const target = await resolveFollowingUserId(
      lookupClient,
      resolvedTargetType as 'creator' | 'attendee',
      resolvedTargetId
    );

    if (!target.data) {
      return NextResponse.json(
        { error: resolvedTargetType === 'creator' ? 'Creator not found' : 'User not found' },
        { status: 404 }
      );
    }

    resolvedTargetType = target.data.resolvedType;
    const followingUserId = target.data.userId;
    const followingIdCandidates = uniqueStringValues([
      target.data.profileId,
      target.data.userId,
      resolvedTargetId,
    ]);

    if (!target.data.isPublicProfile) {
      return NextResponse.json(
        {
          error:
            resolvedTargetType === 'creator'
              ? 'Creator profile is private'
              : 'User profile is private',
        },
        { status: 403 }
      );
    }

    if (!target.data.allowFollows) {
      return NextResponse.json(
        {
          error:
            resolvedTargetType === 'creator'
              ? 'This creator does not accept followers'
              : 'This user does not accept followers',
        },
        { status: 400 }
      );
    }

    const normalizedFollowerType =
      normalizeUserType(user.user_metadata?.user_type) === 'creator' ? 'creator' : 'attendee';

    if (!followingUserId) {
      return NextResponse.json(
        { error: resolvedTargetType === 'creator' ? 'Creator not found' : 'User not found' },
        { status: 404 }
      );
    }

    if (followingIdCandidates.includes(user.id)) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    // Create or reactivate canonical follow row.
    const insertResult = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        follower_type: normalizedFollowerType,
        following_id: followingUserId,
        following_type: resolvedTargetType,
        status: 'active',
      });

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const { error: reactivateError } = await supabase
          .from('follows')
          .update({
            status: 'active',
            following_type: resolvedTargetType,
            follower_type: normalizedFollowerType,
            updated_at: new Date().toISOString(),
          })
          .eq('follower_id', user.id)
          .eq('following_id', followingUserId);

        if (reactivateError) {
          throw reactivateError;
        }
      } else {
        throw insertResult.error;
      }
    }

    // Cleanup legacy rows that used non-canonical IDs.
    const legacyFollowingIds = followingIdCandidates.filter((id) => id !== followingUserId);
    if (legacyFollowingIds.length > 0) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .in('following_id', legacyFollowingIds);
    }

    const activeFollowers = await getActiveFollowerCount(
      lookupClient,
      followingIdCandidates,
      resolvedTargetType
    );

    if (serviceClient) {
      try {
        await serviceClient.from('audit_logs').insert({
          actor_type: normalizedFollowerType,
          actor_id: user.id,
          action: 'follow_created',
          resource_type: 'follow',
          resource_id: `${user.id}:${resolvedTargetType}:${resolvedTargetId}`,
          metadata: {
            following_id: followingUserId,
            following_type: resolvedTargetType,
          },
          ip_address:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            null,
        });
      } catch {
        // Non-blocking audit trail.
      }
    }

    return NextResponse.json({
      success: true,
      followingType: resolvedTargetType,
      followingId: resolvedTargetId,
      followingUserId,
      followersCount: activeFollowers,
    });

  } catch (error) {
    console.error('Follow error:', error);
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}

// DELETE - Unfollow a creator
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const serviceClient = getOptionalServiceClient();
    const lookupClient = serviceClient ?? supabase;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photographerId = searchParams.get('photographerId');
    const attendeeId = searchParams.get('attendeeId');
    const targetId = searchParams.get('targetId') || attendeeId || photographerId;
    const targetType =
      searchParams.get('targetType') === 'attendee'
        ? 'attendee'
        : searchParams.get('targetType') === 'creator' || searchParams.get('targetType') === 'photographer'
        ? 'creator'
        : attendeeId
        ? 'attendee'
        : 'creator';

    if (!targetId) {
      return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
    }

    const normalizedFollowerType =
      normalizeUserType(user.user_metadata?.user_type) === 'creator' ? 'creator' : 'attendee';

    const resolvedTarget = await resolveFollowingUserId(lookupClient, targetType as 'creator' | 'attendee', targetId);
    const followingUserId = resolvedTarget.data?.userId || targetId;
    const resolvedFollowingType = resolvedTarget.data?.resolvedType || targetType;
    const followingIdCandidates = uniqueStringValues([
      resolvedTarget.data?.profileId,
      resolvedTarget.data?.userId,
      targetId,
    ]);

    let deleteQuery = supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id);
    if (followingIdCandidates.length === 1) {
      deleteQuery = deleteQuery.eq('following_id', followingIdCandidates[0]);
    } else {
      deleteQuery = deleteQuery.in('following_id', followingIdCandidates);
    }
    const { error } = await deleteQuery;

    if (error) {
      throw error;
    }

    if (serviceClient) {
      try {
        await serviceClient.from('audit_logs').insert({
          actor_type: normalizedFollowerType,
          actor_id: user.id,
          action: 'follow_deleted',
          resource_type: 'follow',
          resource_id: `${user.id}:${resolvedFollowingType}:${targetId}`,
          metadata: {
            following_id: followingUserId,
            following_type: resolvedFollowingType,
          },
          ip_address:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            null,
        });
      } catch {
        // Non-blocking audit trail.
      }
    }

    const activeFollowers = await getActiveFollowerCount(
      lookupClient,
      followingIdCandidates,
      resolvedFollowingType
    );

    return NextResponse.json({
      success: true,
      followingType: resolvedFollowingType,
      followingId: targetId,
      followingUserId,
      followersCount: activeFollowers,
    });

  } catch (error) {
    console.error('Unfollow error:', error);
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
  }
}

// GET - Check follow status or get following list
export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const serviceClient = getOptionalServiceClient();
    const lookupClient = serviceClient ?? supabase;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photographerId = searchParams.get('photographerId');
    const attendeeId = searchParams.get('attendeeId');
    const targetId = searchParams.get('targetId') || attendeeId || photographerId;
    const targetType =
      searchParams.get('targetType') === 'attendee'
        ? 'attendee'
        : searchParams.get('targetType') === 'creator' || searchParams.get('targetType') === 'photographer'
        ? 'creator'
        : attendeeId
        ? 'attendee'
        : 'creator';
    const type = searchParams.get('type'); // 'check', 'following', 'followers'

    if (type === 'check' && targetId) {
      const resolvedTarget = await resolveFollowingUserId(
        lookupClient,
        targetType as 'creator' | 'attendee',
        targetId
      );
      const followingUserId = resolvedTarget.data?.userId || targetId;
      const resolvedFollowingType = resolvedTarget.data?.resolvedType || targetType;
      const followingIdCandidates = uniqueStringValues([
        resolvedTarget.data?.profileId,
        resolvedTarget.data?.userId,
        targetId,
      ]);
      const followingTypeFilters = getFollowingTypeFilters(resolvedFollowingType);

      // Check if following a specific user
      let checkQuery = supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .in('following_type', followingTypeFilters)
        .eq('status', 'active');

      if (followingIdCandidates.length === 1) {
        checkQuery = checkQuery.eq('following_id', followingIdCandidates[0]);
      } else {
        checkQuery = checkQuery.in('following_id', followingIdCandidates);
      }

      const { data } = await checkQuery.limit(1).maybeSingle();

      return NextResponse.json({ isFollowing: !!data });
    }

    if (type === 'following') {
      const includeAttendees = searchParams.get('includeAttendees') === 'true';
      const { data: followRows, error: followRowsError } = await supabase
        .from('follows')
        .select(`
          id,
          following_id,
          following_type,
          notify_new_event,
          notify_photo_drop,
          created_at
        `)
        .eq('follower_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (followRowsError) {
        throw followRowsError;
      }

      const rows = followRows || [];
      const creatorRows = rows.filter(
        (row: any) => row.following_type === 'creator' || row.following_type === 'photographer'
      );
      const creatorLookup = await fetchCreatorProfilesByIdentifiers(
        lookupClient,
        creatorRows.map((row: any) => row.following_id)
      );

      const following = creatorRows.map((row: any) => {
        const profile = creatorLookup.get(row.following_id) || {
          id: row.following_id,
          display_name: 'Creator',
          face_tag: null,
          profile_photo_url: null,
          bio: null,
          public_profile_slug: null,
        };
        return {
          id: row.id,
          following_id: row.following_id,
          notify_new_event: !!row.notify_new_event,
          notify_photo_drop: !!row.notify_photo_drop,
          created_at: row.created_at,
          photographers: {
            id: profile.id,
            display_name: profile.display_name || 'Creator',
            face_tag: profile.face_tag || '',
            profile_photo_url: profile.profile_photo_url || null,
            bio: profile.bio || null,
            public_profile_slug: profile.public_profile_slug || null,
          },
        };
      });

      if (!includeAttendees) {
        return NextResponse.json({ following, total: following.length });
      }

      const attendeeRows = rows.filter((row: any) => row.following_type === 'attendee');
      const attendeeLookup = await fetchAttendeeProfilesByIdentifiers(
        lookupClient,
        attendeeRows.map((row: any) => row.following_id)
      );

      const followingUsers = attendeeRows.map((row: any) => {
        const profile = attendeeLookup.get(row.following_id) || {
          id: row.following_id,
          display_name: 'Attendee',
          face_tag: null,
          profile_photo_url: null,
          public_profile_slug: null,
        };
        return {
          id: row.id,
          following_id: row.following_id,
          created_at: row.created_at,
          attendees: {
            id: profile.id,
            display_name: profile.display_name || 'Attendee',
            face_tag: profile.face_tag || '',
            profile_photo_url: profile.profile_photo_url || null,
            public_profile_slug: profile.public_profile_slug || null,
          },
        };
      });

      return NextResponse.json({
        following,
        followingUsers,
        total: following.length + followingUsers.length,
      });
    }

    if (type === 'followers') {
      if (targetType === 'attendee') {
        let targetAttendeeId = targetId || attendeeId;
        let targetAttendeeFollowIds: string[] = [];

        if (!targetAttendeeId) {
          const { data: attendee } = await resolveProfileIdByUser(supabase, 'attendees', user.id);

          if (!attendee) {
            return NextResponse.json({ error: 'Not an attendee' }, { status: 403 });
          }
          targetAttendeeId = attendee.id;
          targetAttendeeFollowIds = uniqueStringValues([user.id, attendee.id]);
        } else {
          const { data: attendee } = await getAttendeeByIdentifier(lookupClient, targetAttendeeId);

          if (!attendee) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          const ownerUserId = (attendee as any).user_id || attendee.id;
          const isOwnProfile = user && ownerUserId === user.id;
          if (!isOwnProfile) {
            return NextResponse.json({ error: 'Followers list is private' }, { status: 403 });
          }

          targetAttendeeId = attendee.id;
          targetAttendeeFollowIds = uniqueStringValues([
            (attendee as any).user_id || attendee.id,
            attendee.id,
          ]);
        }

        if (!targetAttendeeFollowIds.length) {
          targetAttendeeFollowIds = uniqueStringValues([targetAttendeeId]);
        }

        let attendeeFollowersQuery = supabase
          .from('follows')
          .select(`
            id,
            follower_id,
            follower_type,
            notify_new_event,
            notify_photo_drop,
            created_at
          `);
        attendeeFollowersQuery = applyFollowingIdFilter(attendeeFollowersQuery, targetAttendeeFollowIds)
          .eq('following_type', 'attendee')
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        const { data: followerRows, error: followerRowsError } = await attendeeFollowersQuery;

        if (followerRowsError) {
          throw followerRowsError;
        }

        const rows = followerRows || [];
        const attendeeFollowerIds = rows
          .filter((row: any) => row.follower_type === 'attendee')
          .map((row: any) => row.follower_id);
        const creatorFollowerIds = rows
          .filter((row: any) => row.follower_type === 'creator' || row.follower_type === 'photographer')
          .map((row: any) => row.follower_id);

        const [attendeeLookup, creatorLookup] = await Promise.all([
          fetchAttendeeProfilesByIdentifiers(lookupClient, attendeeFollowerIds),
          fetchCreatorProfilesByIdentifiers(lookupClient, creatorFollowerIds),
        ]);

        const combinedFollowers = rows.map((row: any) => {
          const isCreatorFollower =
            row.follower_type === 'creator' || row.follower_type === 'photographer';
          const creatorProfile = isCreatorFollower
            ? creatorLookup.get(row.follower_id) || {
                id: row.follower_id,
                display_name: 'Creator',
                face_tag: null,
                profile_photo_url: null,
                email: null,
                public_profile_slug: null,
              }
            : null;
          const attendeeProfile = !isCreatorFollower
            ? attendeeLookup.get(row.follower_id) || {
                id: row.follower_id,
                display_name: 'Attendee',
                face_tag: null,
                profile_photo_url: null,
                email: null,
              }
            : null;

          return {
            id: row.id,
            follower_id: row.follower_id,
            follower_type: isCreatorFollower ? 'creator' : 'attendee',
            notify_new_event: !!row.notify_new_event,
            notify_photo_drop: !!row.notify_photo_drop,
            created_at: row.created_at,
            attendees: attendeeProfile,
            photographers: creatorProfile,
          };
        });

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const stats = {
          total: combinedFollowers.length,
          newThisWeek: combinedFollowers.filter((f: any) => new Date(f.created_at) > weekAgo).length,
          newThisMonth: combinedFollowers.filter((f: any) => new Date(f.created_at) > monthAgo).length,
          withEventNotifications: combinedFollowers.filter((f: any) => f.notify_new_event).length,
          withPhotoNotifications: combinedFollowers.filter((f: any) => f.notify_photo_drop).length,
        };

        return NextResponse.json({
          followers: combinedFollowers,
          total: combinedFollowers.length,
          stats,
        });
      }

      // Get followers for a creator (either by ID or current user)
      let targetCreatorId = targetId || photographerId;
      let targetCreatorFollowIds: string[] = [];

      // If no photographerId provided, get current user's followers (for creators)
      if (!targetCreatorId) {
        const { data: photographer } = await resolveProfileIdByUser(supabase, 'photographers', user.id);

        if (!photographer) {
          return NextResponse.json({ error: 'Not a creator' }, { status: 403 });
        }
        targetCreatorId = photographer.id;
        targetCreatorFollowIds = uniqueStringValues([user.id, photographer.id]);
      } else {
        // Check if photographer exists and profile is public
        const { data: photographer } = await getCreatorByIdentifier(lookupClient, targetCreatorId);

        if (!photographer) {
          return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
        }

        // Allow access if:
        // 1. User is viewing their own followers, OR
        // 2. Creator profile is public
        const ownerUserId = (photographer as any).user_id || photographer.id;
        const isOwnProfile = user && ownerUserId === user.id;
        if (!isOwnProfile) {
          return NextResponse.json({ error: 'Followers list is private' }, { status: 403 });
        }

        targetCreatorId = photographer.id;
        targetCreatorFollowIds = uniqueStringValues([
          (photographer as any).user_id || photographer.id,
          photographer.id,
        ]);
      }

      if (!targetCreatorFollowIds.length) {
        targetCreatorFollowIds = uniqueStringValues([targetCreatorId]);
      }

      let followersQuery = supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          follower_type,
          notify_new_event,
          notify_photo_drop,
          created_at
        `);
      followersQuery = applyFollowingIdFilter(followersQuery, targetCreatorFollowIds)
        .in('following_type', ['creator', 'photographer'])
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      const { data: followerRows, error: followerRowsError } = await followersQuery;

      if (followerRowsError) {
        throw followerRowsError;
      }

      const rows = followerRows || [];
      const attendeeFollowerIds = rows
        .filter((row: any) => row.follower_type === 'attendee')
        .map((row: any) => row.follower_id);
      const creatorFollowerIds = rows
        .filter((row: any) => row.follower_type === 'creator' || row.follower_type === 'photographer')
        .map((row: any) => row.follower_id);

      const [attendeeLookup, creatorLookup] = await Promise.all([
        fetchAttendeeProfilesByIdentifiers(lookupClient, attendeeFollowerIds),
        fetchCreatorProfilesByIdentifiers(lookupClient, creatorFollowerIds),
      ]);

      const data = rows.map((row: any) => {
        const isCreatorFollower =
          row.follower_type === 'creator' || row.follower_type === 'photographer';
        const creatorProfile = isCreatorFollower
          ? creatorLookup.get(row.follower_id) || {
              id: row.follower_id,
              display_name: 'Creator',
              face_tag: null,
              profile_photo_url: null,
              email: null,
              public_profile_slug: null,
            }
          : null;
        const attendeeProfile = !isCreatorFollower
          ? attendeeLookup.get(row.follower_id) || {
              id: row.follower_id,
              display_name: 'Attendee',
              face_tag: null,
              profile_photo_url: null,
              email: null,
            }
          : null;

        return {
          id: row.id,
          follower_id: row.follower_id,
          follower_type: isCreatorFollower ? 'creator' : 'attendee',
          notify_new_event: !!row.notify_new_event,
          notify_photo_drop: !!row.notify_photo_drop,
          created_at: row.created_at,
          attendees: attendeeProfile,
          photographers: creatorProfile,
        };
      });
      const count = data.length;

      // Calculate stats for creator's own followers
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const stats = {
        total: count || 0,
        newThisWeek: (data || []).filter(f => new Date(f.created_at) > weekAgo).length,
        newThisMonth: (data || []).filter(f => new Date(f.created_at) > monthAgo).length,
        withEventNotifications: (data || []).filter(f => f.notify_new_event).length,
        withPhotoNotifications: (data || []).filter(f => f.notify_photo_drop).length,
      };

      return NextResponse.json({ followers: data || [], total: count || 0, stats });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error) {
    console.error('Get follows error:', error);
    return NextResponse.json({ error: 'Failed to get follows' }, { status: 500 });
  }
}

