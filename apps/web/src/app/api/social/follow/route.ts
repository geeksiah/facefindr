/**
 * Follow API
 * 
 * Manage follows for photographers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST - Follow a photographer
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId } = body;

    if (!photographerId) {
      return NextResponse.json({ error: 'Photographer ID required' }, { status: 400 });
    }

    // Check if photographer exists and allows follows
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, allow_follows, display_name')
      .eq('id', photographerId)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
    }

    if (!photographer.allow_follows) {
      return NextResponse.json({ error: 'This photographer does not accept followers' }, { status: 400 });
    }

    // Create follow
    const { error } = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        follower_type: user.user_metadata?.user_type === 'photographer' ? 'photographer' : 'attendee',
        following_id: photographerId,
        following_type: 'photographer',
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyFollowing: true });
      }
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Follow error:', error);
    return NextResponse.json({ error: 'Failed to follow' }, { status: 500 });
  }
}

// DELETE - Unfollow a photographer
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photographerId = searchParams.get('photographerId');

    if (!photographerId) {
      return NextResponse.json({ error: 'Photographer ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', photographerId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

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
    const type = searchParams.get('type'); // 'check', 'following', 'followers'

    if (type === 'check' && photographerId) {
      // Check if following a specific photographer
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', photographerId)
        .single();

      return NextResponse.json({ isFollowing: !!data });
    }

    if (type === 'following') {
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
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      return NextResponse.json({ following: data || [], total: count || 0 });
    }

    if (type === 'followers' && photographerId) {
      // Get followers of a photographer (photographer only sees their own)
      if (photographerId !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const { data, count } = await supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          created_at,
          attendees!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url
          )
        `, { count: 'exact' })
        .eq('following_id', photographerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      return NextResponse.json({ followers: data || [], total: count || 0 });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  } catch (error) {
    console.error('Get follows error:', error);
    return NextResponse.json({ error: 'Failed to get follows' }, { status: 500 });
  }
}
