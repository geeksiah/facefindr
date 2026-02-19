export const dynamic = 'force-dynamic';

/**
 * Get Creator Followers Count
 * 
 * Get the follower count for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = createServiceClient();
    const includeList = request.nextUrl.searchParams.get('include') === 'list';

    // Get photographer by slug or ID
    const withUserId = await supabase
      .from('photographers')
      .select('id, user_id, follower_count, public_profile_slug, is_public_profile')
      .or(`id.eq.${slug},public_profile_slug.eq.${slug},user_id.eq.${slug}`)
      .limit(1)
      .maybeSingle();

    const fallback = await supabase
      .from('photographers')
      .select('id, follower_count, public_profile_slug, is_public_profile')
      .or(`id.eq.${slug},public_profile_slug.eq.${slug}`)
      .limit(1)
      .maybeSingle();

    const photographer =
      withUserId.data ||
      (withUserId.error && isMissingColumnError(withUserId.error, 'user_id')
        ? (fallback.data ? { ...fallback.data, user_id: fallback.data.id } : null)
        : null);

    if (!photographer) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const ownerUserId = (photographer as any).user_id || photographer.id;
    const followTargetIds = uniqueStringValues([ownerUserId, photographer.id]);

    // Get actual follower count from follows table (more accurate than cached count)
    let countQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .in('following_type', ['creator', 'photographer'])
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      countQuery = countQuery.eq('following_id', followTargetIds[0]);
    } else {
      countQuery = countQuery.in('following_id', followTargetIds);
    }
    const { count } = await countQuery;

    if (!includeList) {
      return NextResponse.json({
        count: count || photographer.follower_count || 0,
      });
    }

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.id !== ownerUserId) {
      return NextResponse.json({ error: 'Followers list is private' }, { status: 403 });
    }

    let followersQuery = supabase
      .from('follows')
      .select(`
        id,
        follower_id,
        follower_type,
        created_at,
        attendees!follows_follower_id_fkey (
          id, display_name, face_tag, profile_photo_url
        ),
        photographers!follows_follower_id_fkey (
          id, display_name, face_tag, profile_photo_url, public_profile_slug
        )
      `)
      .in('following_type', ['creator', 'photographer'])
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (followTargetIds.length === 1) {
      followersQuery = followersQuery.eq('following_id', followTargetIds[0]);
    } else {
      followersQuery = followersQuery.in('following_id', followTargetIds);
    }
    const { data: followers } = await followersQuery;

    return NextResponse.json({
      count: count || photographer.follower_count || 0,
      followers: followers || [],
    });

  } catch (error: any) {
    console.error('Get followers count error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get followers count' },
      { status: 500 }
    );
  }
}

