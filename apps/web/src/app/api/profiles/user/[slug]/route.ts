/**
 * User/Attendee Profile API
 * 
 * Get public attendee profile by slug, ID, or FaceTag.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient();
    const { slug } = params;

    // Determine query method
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    // FaceTag can be @username+suffix (new) or @username1234 (legacy)
    const isFaceTag = slug.includes('+') || /^@?[a-z0-9_]+\d{4,5}$/i.test(slug);

    let query = supabase
      .from('attendees')
      .select(`
        id, display_name, face_tag, profile_photo_url,
        is_public_profile, following_count, public_profile_slug
      `);

    if (isUuid) {
      query = query.eq('id', slug);
    } else if (isFaceTag) {
      // Could be face_tag like @username+k7x2 (new) or @username1234 (legacy)
      const tag = slug.startsWith('@') ? slug : `@${slug}`;
      query = query.eq('face_tag', tag);
    } else {
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

    return NextResponse.json({ profile });

  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}
