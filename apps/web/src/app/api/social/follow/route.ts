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
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier}`)
    .single();

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
    .single();

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
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier}`)
    .single();

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
    .single();

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
  if (targetType === 'attendee') {
    const { data, error } = await getAttendeeByIdentifier(supabase, identifier);
    if (error || !data) return { data: null, error };
    return {
      data: {
        profileId: data.id,
        userId: (data as any).user_id || data.id,
        isPublicProfile: Boolean((data as any).is_public_profile),
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
    },
    error: null,
  };
}

// POST - Follow a creator
export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const serviceClient = getOptionalServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId, attendeeId, targetId, targetType } = body;
    const resolvedTargetType =
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

    let followingUserId = resolvedTargetId;

    if (resolvedTargetType === 'creator') {
      // Check if photographer exists and allows follows
      const creatorResult = await getCreatorByIdentifier(supabase, resolvedTargetId);
      const photographer = creatorResult.data as any;

      if (!photographer) {
        return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
      }

      followingUserId = photographer.user_id || photographer.id;

      if (!photographer.is_public_profile) {
        return NextResponse.json({ error: 'Creator profile is private' }, { status: 403 });
      }

      if (photographer.allow_follows === false) {
        return NextResponse.json({ error: 'This creator does not accept followers' }, { status: 400 });
      }
    } else {
      const attendeeWithAllow = await getAttendeeByIdentifier(supabase, resolvedTargetId);

      const attendee =
        attendeeWithAllow.error && isMissingColumnError(attendeeWithAllow.error, 'allow_follows')
          ? (
              await supabase
                .from('attendees')
                .select('id, is_public_profile, display_name')
                .eq('id', resolvedTargetId)
                .single()
            ).data
          : attendeeWithAllow.data;

      if (!attendee) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      followingUserId = (attendee as any).user_id || attendee.id;

      if (!attendee.is_public_profile) {
        return NextResponse.json({ error: 'User profile is private' }, { status: 403 });
      }

      if ((attendee as any).allow_follows === false) {
        return NextResponse.json({ error: 'This user does not accept followers' }, { status: 400 });
      }
    }

    const normalizedFollowerType =
      normalizeUserType(user.user_metadata?.user_type) === 'creator' ? 'creator' : 'attendee';

    if (followingUserId === user.id) {
      return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 });
    }

    // Create follow
    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        follower_type: normalizedFollowerType,
        following_id: followingUserId,
        following_type: resolvedTargetType,
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyFollowing: true });
      }
      throw error;
    }

    if (serviceClient) {
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
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      followingType: resolvedTargetType,
      followingId: resolvedTargetId,
      followingUserId,
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

    const resolvedTarget = await resolveFollowingUserId(supabase, targetType as 'creator' | 'attendee', targetId);
    const followingUserId = resolvedTarget.data?.userId || targetId;

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', followingUserId)
      .eq('following_type', targetType);

    if (error) {
      throw error;
    }

    if (serviceClient) {
      await serviceClient.from('audit_logs').insert({
        actor_type: normalizedFollowerType,
        actor_id: user.id,
        action: 'follow_deleted',
        resource_type: 'follow',
        resource_id: `${user.id}:${targetType}:${targetId}`,
        metadata: {
          following_id: followingUserId,
          following_type: targetType,
        },
        ip_address:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          null,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, followingType: targetType, followingId: targetId, followingUserId });

  } catch (error) {
    console.error('Unfollow error:', error);
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
  }
}

// GET - Check follow status or get following list
export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
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
        supabase,
        targetType as 'creator' | 'attendee',
        targetId
      );
      const followingUserId = resolvedTarget.data?.userId || targetId;

      // Check if following a specific user
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', followingUserId)
        .eq('following_type', targetType)
        .single();

      return NextResponse.json({ isFollowing: !!data });
    }

    if (type === 'following') {
      const includeAttendees = searchParams.get('includeAttendees') === 'true';
      // Get list of creators user is following
      const { data, count } = await supabase
        .from('follows')
        .select(`
          id,
          following_id,
          notify_new_event,
          notify_photo_drop,
          created_at,
          photographers!follows_following_id_fkey (
            id, display_name, face_tag, profile_photo_url, bio, public_profile_slug
          )
        `, { count: 'exact' })
        .eq('follower_id', user.id)
        .in('following_type', ['creator', 'photographer'])
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (!includeAttendees) {
        return NextResponse.json({ following: data || [], total: count || 0 });
      }

      const { data: attendeeFollowing, count: attendeeCount } = await supabase
        .from('follows')
        .select(`
          id,
          following_id,
          created_at,
          attendees!follows_following_id_fkey (
            id, display_name, face_tag, profile_photo_url, public_profile_slug
          )
        `, { count: 'exact' })
        .eq('follower_id', user.id)
        .eq('following_type', 'attendee')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      return NextResponse.json({
        following: data || [],
        followingUsers: attendeeFollowing || [],
        total: (count || 0) + (attendeeCount || 0),
      });
    }

    if (type === 'followers') {
      if (targetType === 'attendee') {
        let targetAttendeeId = targetId || attendeeId;
        let targetAttendeeFollowId = targetAttendeeId;

        if (!targetAttendeeId) {
          const { data: attendee } = await resolveProfileIdByUser(supabase, 'attendees', user.id);

          if (!attendee) {
            return NextResponse.json({ error: 'Not an attendee' }, { status: 403 });
          }
          targetAttendeeId = attendee.id;
          targetAttendeeFollowId = user.id;
        } else {
          const { data: attendee } = await getAttendeeByIdentifier(supabase, targetAttendeeId);

          if (!attendee) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          const ownerUserId = (attendee as any).user_id || attendee.id;
          const isOwnProfile = user && ownerUserId === user.id;
          if (!isOwnProfile && !attendee.is_public_profile) {
            return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
          }

          targetAttendeeId = attendee.id;
          targetAttendeeFollowId = (attendee as any).user_id || attendee.id;
        }

        const [attendeeFollowersRes, creatorFollowersRes] = await Promise.all([
          supabase
            .from('follows')
            .select(`
              id,
              follower_id,
              follower_type,
              notify_new_event,
              notify_photo_drop,
              created_at,
              attendees!follows_follower_id_fkey (
                id, display_name, face_tag, profile_photo_url, email
              )
            `)
            .eq('following_id', targetAttendeeFollowId)
            .eq('following_type', 'attendee')
            .eq('follower_type', 'attendee')
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
          supabase
            .from('follows')
            .select(`
              id,
              follower_id,
              follower_type,
              notify_new_event,
              notify_photo_drop,
              created_at,
              photographers!follows_follower_id_fkey (
                id, display_name, face_tag, profile_photo_url, email, public_profile_slug
              )
            `)
            .eq('following_id', targetAttendeeFollowId)
            .eq('following_type', 'attendee')
            .in('follower_type', ['creator', 'photographer'])
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
        ]);

        const combinedFollowers = [
          ...(attendeeFollowersRes.data || []),
          ...(creatorFollowersRes.data || []),
        ].sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

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
      let targetCreatorId = photographerId;
      let targetCreatorFollowId = photographerId;

      // If no photographerId provided, get current user's followers (for creators)
      if (!targetCreatorId) {
        const { data: photographer } = await resolveProfileIdByUser(supabase, 'photographers', user.id);

        if (!photographer) {
          return NextResponse.json({ error: 'Not a creator' }, { status: 403 });
        }
        targetCreatorId = photographer.id;
        targetCreatorFollowId = user.id;
      } else {
        // Check if photographer exists and profile is public
        const { data: photographer } = await getCreatorByIdentifier(supabase, targetCreatorId);

        if (!photographer) {
          return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
        }

        // Allow access if:
        // 1. User is viewing their own followers, OR
        // 2. Creator profile is public
        const ownerUserId = (photographer as any).user_id || photographer.id;
        const isOwnProfile = user && ownerUserId === user.id;
        if (!isOwnProfile && !photographer.is_public_profile) {
          return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
        }

        targetCreatorId = photographer.id;
        targetCreatorFollowId = (photographer as any).user_id || photographer.id;
      }

      const { data, count } = await supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          follower_type,
          notify_new_event,
          notify_photo_drop,
          created_at,
          attendees!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url, email
          ),
          photographers!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url, email, public_profile_slug
          )
        `, { count: 'exact' })
        .eq('following_id', targetCreatorFollowId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

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

