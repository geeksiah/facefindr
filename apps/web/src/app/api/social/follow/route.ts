export const dynamic = 'force-dynamic';

/**
 * Follow API
 * 
 * Manage follows for photographers.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST - Follow a photographer
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId, attendeeId, targetId, targetType } = body;
    const resolvedTargetType =
      targetType === 'attendee'
        ? 'attendee'
        : targetType === 'photographer'
        ? 'photographer'
        : attendeeId
        ? 'attendee'
        : 'photographer';
    const resolvedTargetId =
      targetId ||
      (resolvedTargetType === 'attendee' ? attendeeId : photographerId);

    if (!resolvedTargetId) {
      return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
    }

    if (resolvedTargetType === 'photographer') {
      // Check if photographer exists and allows follows
      const { data: photographer } = await supabase
        .from('photographers')
        .select('id, allow_follows, display_name, is_public_profile')
        .eq('id', resolvedTargetId)
        .single();

      if (!photographer) {
        return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
      }

      if (!photographer.is_public_profile) {
        return NextResponse.json({ error: 'Photographer profile is private' }, { status: 403 });
      }

      if (!photographer.allow_follows) {
        return NextResponse.json({ error: 'This photographer does not accept followers' }, { status: 400 });
      }
    } else {
      const { data: attendee } = await supabase
        .from('attendees')
        .select('id, is_public_profile, display_name')
        .eq('id', resolvedTargetId)
        .single();

      if (!attendee) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!attendee.is_public_profile) {
        return NextResponse.json({ error: 'User profile is private' }, { status: 403 });
      }
    }

    // Create follow
    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        follower_type: user.user_metadata?.user_type === 'photographer' ? 'photographer' : 'attendee',
        following_id: resolvedTargetId,
        following_type: resolvedTargetType,
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyFollowing: true });
      }
      throw error;
    }

    await serviceClient.from('audit_logs').insert({
      actor_type: user.user_metadata?.user_type === 'photographer' ? 'photographer' : 'attendee',
      actor_id: user.id,
      action: 'follow_created',
      resource_type: 'follow',
      resource_id: `${user.id}:${resolvedTargetType}:${resolvedTargetId}`,
      metadata: {
        following_id: resolvedTargetId,
        following_type: resolvedTargetType,
      },
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null,
    }).catch(() => {});

    return NextResponse.json({ success: true, followingType: resolvedTargetType, followingId: resolvedTargetId });

  } catch (error) {
    console.error('Follow error:', error);
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}

// DELETE - Unfollow a photographer
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
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
        : searchParams.get('targetType') === 'photographer'
        ? 'photographer'
        : attendeeId
        ? 'attendee'
        : 'photographer';

    if (!targetId) {
      return NextResponse.json({ error: 'Target ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetId)
      .eq('following_type', targetType);

    if (error) {
      throw error;
    }

    await serviceClient.from('audit_logs').insert({
      actor_type: user.user_metadata?.user_type === 'photographer' ? 'photographer' : 'attendee',
      actor_id: user.id,
      action: 'follow_deleted',
      resource_type: 'follow',
      resource_id: `${user.id}:${targetType}:${targetId}`,
      metadata: {
        following_id: targetId,
        following_type: targetType,
      },
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null,
    }).catch(() => {});

    return NextResponse.json({ success: true, followingType: targetType, followingId: targetId });

  } catch (error) {
    console.error('Unfollow error:', error);
    return NextResponse.json({ error: 'Failed to unfollow' }, { status: 500 });
  }
}

// GET - Check follow status or get following list
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
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
        : searchParams.get('targetType') === 'photographer'
        ? 'photographer'
        : attendeeId
        ? 'attendee'
        : 'photographer';
    const type = searchParams.get('type'); // 'check', 'following', 'followers'

    if (type === 'check' && targetId) {
      // Check if following a specific user
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', targetId)
        .eq('following_type', targetType)
        .single();

      return NextResponse.json({ isFollowing: !!data });
    }

    if (type === 'following') {
      const includeAttendees = searchParams.get('includeAttendees') === 'true';
      // Get list of photographers user is following
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
        .eq('following_type', 'photographer')
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
      // Get followers for a photographer (either by ID or current user)
      let targetPhotographerId = photographerId;
      
      // If no photographerId provided, get current user's followers (for photographers)
      if (!targetPhotographerId) {
        const { data: photographer } = await supabase
          .from('photographers')
          .select('id')
          .eq('user_id', user.id)
          .single();
        
        if (!photographer) {
          return NextResponse.json({ error: 'Not a photographer' }, { status: 403 });
        }
        targetPhotographerId = photographer.id;
      } else {
        // Check if photographer exists and profile is public
        const { data: photographer } = await supabase
          .from('photographers')
          .select('id, is_public_profile, public_profile_slug, user_id')
          .or(`id.eq.${targetPhotographerId},public_profile_slug.eq.${targetPhotographerId}`)
          .single();

        if (!photographer) {
          return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
        }

        // Allow access if:
        // 1. User is viewing their own followers, OR
        // 2. Photographer profile is public
        const isOwnProfile = user && photographer.user_id === user.id;
        if (!isOwnProfile && !photographer.is_public_profile) {
          return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
        }
        
        targetPhotographerId = photographer.id;
      }

      const { data, count } = await supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          notify_new_event,
          notify_photo_drop,
          created_at,
          attendees!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url, email
          )
        `, { count: 'exact' })
        .eq('following_id', targetPhotographerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      // Calculate stats for photographer's own followers
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

