export const dynamic = 'force-dynamic';

/**
 * User/Attendee Profile API
 * 
 * Get public attendee profile by slug, ID, or FaceTag.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

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
    // FaceTag can be @username+suffix (new) or @username1234 (legacy)
    const isFaceTag = slug.includes('+') || /^@?[a-z0-9_]+\d{4,5}$/i.test(slug);

    const fullSelect = `
      id, display_name, face_tag, profile_photo_url,
      is_public_profile, following_count, public_profile_slug
    `;
    const minimalSelect = 'id, display_name, face_tag, profile_photo_url';

    async function queryProfile(selectClause: string) {
      let query = supabase.from('attendees').select(selectClause);

      if (isUuid) {
        query = query.eq('id', slug);
      } else if (isFaceTag) {
        const tag = slug.startsWith('@') ? slug : `@${slug}`;
        query = query.eq('face_tag', tag);
      } else {
        query = query.eq('public_profile_slug', slug);
      }

      return query.maybeSingle();
    }

    let { data: profile, error } = await queryProfile(fullSelect);

    // Fallback if columns don't exist
    if (error?.code === '42703') {
      const fallback = await queryProfile(minimalSelect);
      profile = fallback.data;
      error = fallback.error;
    }

    if (error || !profile) {
      // If lookup was by slug and failed, also try as a facetag
      if (!isUuid && !isFaceTag) {
        const tag = slug.startsWith('@') ? slug : `@${slug}`;
        const { data: tagProfile } = await supabase
          .from('attendees')
          .select(minimalSelect)
          .eq('face_tag', tag)
          .maybeSingle();
        if (tagProfile) {
          return NextResponse.json({ profile: tagProfile });
        }
      }
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });

  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

