export const dynamic = 'force-dynamic';

/**
 * Get Creator Followers Count
 * 
 * Get the follower count for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = createServiceClient();
    const includeList = request.nextUrl.searchParams.get('include') === 'list';

    // Get photographer by slug or ID
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, follower_count, public_profile_slug, is_public_profile')
      .or(`id.eq.${slug},public_profile_slug.eq.${slug}`)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    // Get actual follower count from follows table (more accurate than cached count)
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', photographer.id)
      .in('following_type', ['creator', 'photographer'])
      .eq('status', 'active');

    if (!includeList) {
      return NextResponse.json({
        count: count || photographer.follower_count || 0,
      });
    }

    if (!photographer.is_public_profile) {
      return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
    }

    const { data: followers } = await supabase
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
      .eq('following_id', photographer.id)
      .in('following_type', ['creator', 'photographer'])
      .eq('status', 'active')
      .order('created_at', { ascending: false });

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

