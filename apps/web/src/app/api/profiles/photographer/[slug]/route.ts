export const dynamic = 'force-dynamic';

/**
 * Photographer Profile API
 * 
 * Get public photographer profile by slug, ID, or FaceTag.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createClient();
    const { slug } = params;

    // Determine query method
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    // FaceTag can be @username+suffix (new) or @username1234 (legacy)
    const isFaceTag = slug.includes('+') || /^@?[a-z0-9_]+\d{4,5}$/i.test(slug);

    let query = supabase
      .from('photographers')
      .select(`
        id, display_name, face_tag, bio, profile_photo_url,
        website_url, instagram_url, twitter_url, facebook_url,
        is_public_profile, allow_follows, follower_count,
        public_profile_slug, created_at
      `);

    if (isUuid) {
      query = query.eq('id', slug);
    } else if (isFaceTag) {
      // Could be face_tag like @username+k7x2 (new) or @username1234 (legacy)
      const tag = slug.startsWith('@') ? slug : `@${slug}`;
      query = query.eq('face_tag', tag);
    } else {
      // Assume it's a slug
      query = query.eq('public_profile_slug', slug);
    }

    const { data: profile, error } = await query.single();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Check if profile is public
    if (!profile.is_public_profile) {
      return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
    }

    // Get recent events
    const { data: events } = await supabase
      .from('events')
      .select('id, name, cover_image_url, event_date, event_start_at_utc, event_timezone, location, public_slug')
      .eq('photographer_id', profile.id)
      .eq('status', 'active')
      .order('event_date', { ascending: false })
      .limit(6);

    // Get total event count
    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', profile.id)
      .eq('status', 'active');

    return NextResponse.json({
      profile: {
        ...profile,
        events: events || [],
        eventCount: eventCount || 0,
      },
    });

  } catch (error) {
    console.error('Get photographer profile error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

