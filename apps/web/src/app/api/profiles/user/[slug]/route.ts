export const dynamic = 'force-dynamic';

/**
 * User/Attendee Profile API
 * 
 * Get public attendee profile by slug, ID, or FaceTag.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // Use service client to bypass RLS for public profile viewing
    const supabase = createServiceClient();
    const { slug } = params;

    // Determine query method
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    // FaceTag: @username.1234, @username+k7x2, @username1234, etc.
    const isFaceTag = slug.includes('+') || /^@?[a-z0-9_.]+[+.]?\d{3,5}$/i.test(slug);

    const fullSelect = `
      id, user_id, display_name, face_tag, profile_photo_url,
      is_public_profile, allow_follows, following_count, public_profile_slug
    `;
    const minimalSelect = 'id, display_name, face_tag, profile_photo_url';

    const queryProfile = async (selectClause: string, useUserId = true) => {
      let query = supabase.from('attendees').select(selectClause);

      if (isUuid) {
        query = useUserId ? query.or(`id.eq.${slug},user_id.eq.${slug}`) : query.eq('id', slug);
      } else if (isFaceTag) {
        const tag = slug.startsWith('@') ? slug : `@${slug}`;
        query = query.eq('face_tag', tag);
      } else {
        query = query.eq('public_profile_slug', slug);
      }

      return query.maybeSingle();
    };

    let { data: profile, error } = await queryProfile(fullSelect);

    // Fallback if columns don't exist
    if (error?.code === '42703') {
      const fallback = await queryProfile(minimalSelect, false);
      profile = fallback.data;
      error = fallback.error;
    }

    if (error || !profile) {
      // If lookup was by slug and failed, also try as a facetag
      if (!isUuid && !isFaceTag) {
        const tag = slug.startsWith('@') ? slug : `@${slug}`;
        const { data: tagProfile } = await supabase
          .from('attendees')
          .select(fullSelect)
          .eq('face_tag', tag)
          .maybeSingle();
        if (tagProfile) {
          profile = tagProfile;
          error = null;
        }
      }
      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
    }

    const followTargetIds = uniqueStringValues([(profile as any).user_id || profile.id, profile.id]);

    let followersQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_type', 'attendee')
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      followersQuery = followersQuery.eq('following_id', followTargetIds[0]);
    } else {
      followersQuery = followersQuery.in('following_id', followTargetIds);
    }

    let followingQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      followingQuery = followingQuery.eq('follower_id', followTargetIds[0]);
    } else {
      followingQuery = followingQuery.in('follower_id', followTargetIds);
    }

    const [{ count: followersCount }, { count: followingCount }, privacyResult] = await Promise.all([
      followersQuery,
      followingQuery,
      supabase
        .from('user_privacy_settings')
        .select('profile_visible, show_in_search, allow_follows')
        .eq('user_id', (profile as any).user_id || profile.id)
        .maybeSingle(),
    ]);

    const privacySettings = privacyResult?.error ? null : privacyResult?.data;
    const isPublicProfile = Boolean(
      privacySettings?.profile_visible ?? profile.is_public_profile ?? false
    );

    return NextResponse.json({
      profile: {
        ...profile,
        is_public_profile: isPublicProfile,
        allow_follows:
          privacySettings?.allow_follows ??
          (profile as any)?.allow_follows ??
          isPublicProfile,
        follow_target_id: (profile as any).user_id || profile.id,
        followers_count: followersCount || 0,
        following_count:
          typeof profile.following_count === 'number'
            ? profile.following_count
            : (followingCount || 0),
      },
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

