/**
 * Get Photographer Followers Count
 * 
 * Get the follower count for a photographer
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    const supabase = createClient();

    // Get photographer by slug or ID
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, follower_count, public_profile_slug')
      .or(`id.eq.${slug},public_profile_slug.eq.${slug}`)
      .single();

    if (!photographer) {
      return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
    }

    // Get actual follower count from follows table (more accurate than cached count)
    const { count } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', photographer.id)
      .eq('status', 'active');

    return NextResponse.json({
      count: count || photographer.follower_count || 0,
    });

  } catch (error: any) {
    console.error('Get followers count error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get followers count' },
      { status: 500 }
    );
  }
}
