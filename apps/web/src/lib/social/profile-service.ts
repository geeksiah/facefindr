/**
 * Profile Service
 * 
 * Handles public profile pages and QR code generation for sharing.
 */

import { createClient } from '@/lib/supabase/server';
import { generateQRCode } from '@/lib/sharing/qr-service';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const APP_SCHEME = 'facefindr://';

interface ProfileResult {
  success: boolean;
  profile?: any;
  error?: string;
}

/**
 * Get photographer public profile
 */
export async function getPhotographerProfile(
  slugOrId: string
): Promise<ProfileResult> {
  try {
    const supabase = await createClient();

    // Try to find by slug first, then by ID
    let query = supabase
      .from('photographers')
      .select(`
        id, display_name, face_tag, bio, profile_photo_url,
        website_url, instagram_url, twitter_url, facebook_url,
        is_public_profile, allow_follows, follower_count,
        public_profile_slug, created_at
      `)
      .eq('is_public_profile', true);

    // Check if it's a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    
    if (isUuid) {
      query = query.eq('id', slugOrId);
    } else {
      query = query.or(`public_profile_slug.eq.${slugOrId},face_tag.eq.@${slugOrId}`);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return { success: false, error: 'Profile not found' };
    }

    // Get recent events
    const { data: events } = await supabase
      .from('events')
      .select('id, name, cover_image_url, event_date, location, public_slug')
      .eq('photographer_id', data.id)
      .eq('status', 'active')
      .eq('is_publicly_listed', true)
      .order('event_date', { ascending: false })
      .limit(6);

    // Get total event count
    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', data.id)
      .eq('status', 'active');

    return {
      success: true,
      profile: {
        ...data,
        events: events || [],
        eventCount: eventCount || 0,
      },
    };
  } catch (error) {
    console.error('Get photographer profile error:', error);
    return { success: false, error: 'Failed to load profile' };
  }
}

/**
 * Get attendee public profile (limited info)
 */
export async function getAttendeeProfile(
  slugOrId: string
): Promise<ProfileResult> {
  try {
    const supabase = await createClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    let query = supabase
      .from('attendees')
      .select(`
        id, display_name, face_tag, profile_photo_url,
        is_public_profile, following_count, public_profile_slug
      `)
      .eq('is_public_profile', true);

    if (isUuid) {
      query = query.eq('id', slugOrId);
    } else {
      query = query.or(`public_profile_slug.eq.${slugOrId},face_tag.eq.@${slugOrId}`);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return { success: false, error: 'Profile not found' };
    }

    return { success: true, profile: data };
  } catch (error) {
    console.error('Get attendee profile error:', error);
    return { success: false, error: 'Failed to load profile' };
  }
}

/**
 * Generate profile sharing URLs
 */
export function generateProfileUrls(
  profileType: 'photographer' | 'attendee',
  slug: string,
  id: string
): {
  webUrl: string;
  appDeepLink: string;
  universalLink: string;
  qrUrl: string;
} {
  const prefix = profileType === 'photographer' ? 'p' : 'u';
  
  const webUrl = `${APP_URL}/${prefix}/${slug}`;
  const appDeepLink = `${APP_SCHEME}profile/${profileType}/${id}`;
  const universalLink = `${webUrl}?app=1`; // Web page will attempt deep link first
  
  return {
    webUrl,
    appDeepLink,
    universalLink,
    qrUrl: universalLink, // QR code links to universal link
  };
}

/**
 * Generate profile QR code
 */
export async function generateProfileQRCode(
  profileType: 'photographer' | 'attendee',
  slug: string,
  id: string,
  options?: { size?: number; theme?: 'light' | 'dark' }
): Promise<string> {
  const urls = generateProfileUrls(profileType, slug, id);
  
  return generateQRCode(urls.qrUrl, {
    size: options?.size || 512,
    darkColor: options?.theme === 'dark' ? '#FFFFFF' : '#1A1A1A',
    lightColor: options?.theme === 'dark' ? '#1C1C1E' : '#FFFFFF',
    errorCorrection: 'H',
  });
}

/**
 * Track profile view
 */
export async function trackProfileView(
  profileId: string,
  profileType: 'photographer' | 'attendee',
  source?: string,
  deviceType?: string
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('profile_views').insert({
      profile_id: profileId,
      profile_type: profileType,
      viewer_id: user?.id,
      source,
      device_type: deviceType,
    });
  } catch (error) {
    console.error('Track profile view error:', error);
    // Non-blocking
  }
}

/**
 * Update profile slug
 */
export async function updateProfileSlug(
  userId: string,
  userType: 'photographer' | 'attendee',
  newSlug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Validate slug format
    const slug = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').trim();
    
    if (slug.length < 3) {
      return { success: false, error: 'Slug must be at least 3 characters' };
    }
    if (slug.length > 40) {
      return { success: false, error: 'Slug must be 40 characters or less' };
    }

    // Check availability in both tables
    const { data: existing } = await supabase
      .from('photographers')
      .select('id')
      .eq('public_profile_slug', slug)
      .neq('id', userId)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: 'This URL is already taken' };
    }

    const { data: existingAttendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('public_profile_slug', slug)
      .neq('id', userId)
      .limit(1);

    if (existingAttendee && existingAttendee.length > 0) {
      return { success: false, error: 'This URL is already taken' };
    }

    // Update the appropriate table
    const table = userType === 'photographer' ? 'photographers' : 'attendees';
    const { error } = await supabase
      .from(table)
      .update({ public_profile_slug: slug })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Update profile slug error:', error);
    return { success: false, error: 'Failed to update profile URL' };
  }
}
