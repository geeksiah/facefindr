export const dynamic = 'force-dynamic';

/**
 * Creator Profile API
 *
 * Get public photographer profile by slug, ID, or FaceTag.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

function isMissingColumnError(error: any): boolean {
  return error?.code === '42703' || error?.code === '42P01';
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createServiceClient();
    const { slug } = params;

    // Determine query method
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    // FaceTag: @username.1234, @username+k7x2, @username1234, etc.
    const isFaceTag = slug.includes('+') || /^@?[a-z0-9_.]+[+.]?\d{3,5}$/i.test(slug);

    const fullSelect = `
      id, display_name, face_tag, bio, profile_photo_url,
      website, instagram, twitter, facebook,
      is_public_profile, allow_follows, follower_count,
      public_profile_slug, created_at, user_id
    `;
    const minimalSelect =
      'id, display_name, face_tag, bio, profile_photo_url, website, instagram, twitter, facebook, is_public_profile, allow_follows, follower_count, created_at';

    const queryProfile = async (selectClause: string) => {
      const supportsUserId = selectClause.includes('user_id');
      let q = supabase.from('photographers').select(selectClause);

      if (isUuid) {
        q = supportsUserId ? q.or(`id.eq.${slug},user_id.eq.${slug}`) : q.eq('id', slug);
      } else if (isFaceTag) {
        const tag = slug.startsWith('@') ? slug : `@${slug}`;
        q = q.eq('face_tag', tag);
      } else {
        q = q.eq('public_profile_slug', slug);
      }

      return q.maybeSingle();
    };

    let { data: profile, error } = await queryProfile(fullSelect);

    // Fallback if columns don't exist
    if (isMissingColumnError(error)) {
      const fallback = await queryProfile(minimalSelect);
      profile = fallback.data;
      error = fallback.error;
    }

    // If not found by slug, also try as a facetag
    if (!profile && !isUuid && !isFaceTag) {
      const tag = slug.startsWith('@') ? slug : `@${slug}`;
      const { data: tagProfile } = await supabase
        .from('photographers')
        .select(minimalSelect)
        .eq('face_tag', tag)
        .maybeSingle();
      if (tagProfile) {
        profile = tagProfile;
      }
    }

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get recent events (with column fallback)
    const eventFullSelect = 'id, name, cover_image_url, event_date, event_timezone, location, public_slug';
    const eventMinimalSelect = 'id, name, cover_image_url, event_date, location';

    let events: any[] | null = null;
    let eventCount: number | null = null;

    const eventsResult = await supabase
      .from('events')
      .select(eventFullSelect)
      .eq('photographer_id', profile.id)
      .eq('status', 'active')
      .order('event_date', { ascending: false })
      .limit(6);

    if (isMissingColumnError(eventsResult.error)) {
      const fallbackEvents = await supabase
        .from('events')
        .select(eventMinimalSelect)
        .eq('photographer_id', profile.id)
        .eq('status', 'active')
        .order('event_date', { ascending: false })
        .limit(6);
      events = fallbackEvents.data;
    } else {
      events = eventsResult.data;
    }

    // Get total event count
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('photographer_id', profile.id)
      .eq('status', 'active');
    eventCount = count;

    const followTargetIds = uniqueStringValues([(profile as any).user_id || profile.id, profile.id]);
    let followersCountQuery = supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .in('following_type', ['creator', 'photographer'])
      .eq('status', 'active');
    if (followTargetIds.length === 1) {
      followersCountQuery = followersCountQuery.eq('following_id', followTargetIds[0]);
    } else {
      followersCountQuery = followersCountQuery.in('following_id', followTargetIds);
    }
    const { count: followersCount } = await followersCountQuery;

    // Generate signed cover image URLs for events
    const eventsWithCovers = (events || []).map((event: any) => {
      if (event.cover_image_url && !event.cover_image_url.startsWith('http')) {
        const coverPath = event.cover_image_url.replace(/^\/+/, '');
        const { data } = supabase.storage.from('covers').getPublicUrl(coverPath);
        return { ...event, cover_image_url: data.publicUrl };
      }
      return event;
    });

    return NextResponse.json({
      profile: {
        ...profile,
        follower_count: followersCount || profile.follower_count || 0,
        follow_target_id: (profile as any).user_id || profile.id,
        website_url: (profile as any).website_url ?? (profile as any).website ?? null,
        instagram_url: (profile as any).instagram_url ?? (profile as any).instagram ?? null,
        twitter_url: (profile as any).twitter_url ?? (profile as any).twitter ?? null,
        facebook_url: (profile as any).facebook_url ?? (profile as any).facebook ?? null,
        events: eventsWithCovers,
        eventCount: eventCount || 0,
      },
    });

  } catch (error) {
    console.error('Get photographer profile error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}
