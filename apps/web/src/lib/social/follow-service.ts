/**
 * Follow Service
 * 
 * Manages follows between attendees and photographers.
 */

import { createClient } from '@/lib/supabase/server';

interface FollowResult {
  success: boolean;
  error?: string;
  isFollowing?: boolean;
}

/**
 * Follow a photographer
 */
export async function followPhotographer(
  photographerId: string
): Promise<FollowResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if photographer exists and allows follows
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, allow_follows')
      .eq('id', photographerId)
      .single();

    if (!photographer) {
      return { success: false, error: 'Photographer not found' };
    }

    if (!photographer.allow_follows) {
      return { success: false, error: 'This photographer does not accept followers' };
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
        return { success: true, isFollowing: true }; // Already following
      }
      throw error;
    }

    return { success: true, isFollowing: true };
  } catch (error) {
    console.error('Follow error:', error);
    return { success: false, error: 'Failed to follow' };
  }
}

/**
 * Unfollow a photographer
 */
export async function unfollowPhotographer(
  photographerId: string
): Promise<FollowResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', photographerId);

    if (error) {
      throw error;
    }

    return { success: true, isFollowing: false };
  } catch (error) {
    console.error('Unfollow error:', error);
    return { success: false, error: 'Failed to unfollow' };
  }
}

/**
 * Check if user is following a photographer
 */
export async function isFollowing(
  photographerId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return false;

    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', photographerId)
      .single();

    return !!data;
  } catch {
    return false;
  }
}

/**
 * Get followers of a photographer
 */
export async function getFollowers(
  photographerId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ success: boolean; followers?: any[]; total?: number; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from('follows')
      .select(`
        id,
        follower_id,
        follower_type,
        created_at,
        attendees!follows_follower_id_fkey (
          id, display_name, face_tag, profile_photo_url
        )
      `, { count: 'exact' })
      .eq('following_id', photographerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return { success: true, followers: data || [], total: count || 0 };
  } catch (error) {
    console.error('Get followers error:', error);
    return { success: false, error: 'Failed to get followers' };
  }
}

/**
 * Get photographers a user is following
 */
export async function getFollowing(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ success: boolean; following?: any[]; total?: number; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error, count } = await supabase
      .from('follows')
      .select(`
        id,
        following_id,
        notify_new_event,
        notify_photo_drop,
        created_at,
        photographers!follows_following_id_fkey (
          id, display_name, face_tag, profile_photo_url, bio
        )
      `, { count: 'exact' })
      .eq('follower_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return { success: true, following: data || [], total: count || 0 };
  } catch (error) {
    console.error('Get following error:', error);
    return { success: false, error: 'Failed to get following' };
  }
}

/**
 * Update follow notification preferences
 */
export async function updateFollowPreferences(
  photographerId: string,
  preferences: { notifyNewEvent?: boolean; notifyPhotoDrop?: boolean }
): Promise<FollowResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const updates: Record<string, any> = {};
    if (preferences.notifyNewEvent !== undefined) {
      updates.notify_new_event = preferences.notifyNewEvent;
    }
    if (preferences.notifyPhotoDrop !== undefined) {
      updates.notify_photo_drop = preferences.notifyPhotoDrop;
    }

    const { error } = await supabase
      .from('follows')
      .update(updates)
      .eq('follower_id', user.id)
      .eq('following_id', photographerId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Update follow preferences error:', error);
    return { success: false, error: 'Failed to update preferences' };
  }
}

/**
 * Search for photographers by FaceTag or name
 */
export async function searchPhotographers(
  query: string,
  limit: number = 20
): Promise<{ success: boolean; photographers?: any[]; error?: string }> {
  try {
    const supabase = await createClient();

    // Search by face_tag or display_name
    const searchTerm = query.replace('@', '').toLowerCase();

    const { data, error } = await supabase
      .from('photographers')
      .select('id, display_name, face_tag, profile_photo_url, bio, follower_count, is_public_profile')
      .eq('is_public_profile', true)
      .or(`face_tag.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
      .order('follower_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return { success: true, photographers: data || [] };
  } catch (error) {
    console.error('Search photographers error:', error);
    return { success: false, error: 'Failed to search' };
  }
}
