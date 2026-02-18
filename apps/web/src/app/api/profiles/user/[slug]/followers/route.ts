export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

type FollowerProfile = {
  id: string;
  display_name: string;
  face_tag: string | null;
  profile_photo_url: string | null;
  public_profile_slug?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isFaceTag(value: string) {
  return value.includes('+') || /^@?[a-z0-9_.]+[+.]?\d{3,5}$/i.test(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createServiceClient();
    const { slug } = params;
    const queryType = request.nextUrl.searchParams.get('type');

    let profileQuery = supabase
      .from('attendees')
      .select('id, display_name, face_tag, profile_photo_url, is_public_profile, public_profile_slug');

    if (isUuid(slug)) {
      profileQuery = profileQuery.eq('id', slug);
    } else if (isFaceTag(slug)) {
      profileQuery = profileQuery.eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`);
    } else {
      profileQuery = profileQuery.eq('public_profile_slug', slug);
    }

    let { data: profile, error } = await profileQuery.maybeSingle();

    if (!profile && !error && !isUuid(slug) && !isFaceTag(slug)) {
      const { data: byFaceTag } = await supabase
        .from('attendees')
        .select('id, display_name, face_tag, profile_photo_url, is_public_profile, public_profile_slug')
        .eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`)
        .maybeSingle();
      profile = byFaceTag;
    }

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const privacyResult = await supabase
      .from('user_privacy_settings')
      .select('profile_visible')
      .eq('user_id', profile.id)
      .maybeSingle();
    const isPublic = Boolean(
      privacyResult.data?.profile_visible ?? profile.is_public_profile ?? false
    );

    if (!isPublic) {
      return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
    }

    const [attendeeFollowersRes, creatorFollowersRes] = await Promise.all([
      supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          follower_type,
          created_at,
          attendees!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url, public_profile_slug
          )
        `)
        .eq('following_id', profile.id)
        .eq('following_type', 'attendee')
        .eq('follower_type', 'attendee')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('follows')
        .select(`
          id,
          follower_id,
          follower_type,
          created_at,
          photographers!follows_follower_id_fkey (
            id, display_name, face_tag, profile_photo_url, public_profile_slug
          )
        `)
        .eq('following_id', profile.id)
        .eq('following_type', 'attendee')
        .in('follower_type', ['creator', 'photographer'])
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
    ]);

    const attendeeFollowers = (attendeeFollowersRes.data || []).map((item: any) => ({
      id: item.id,
      follower_id: item.follower_id,
      follower_type: 'attendee',
      created_at: item.created_at,
      profile: item.attendees as FollowerProfile | null,
    }));

    const creatorFollowers = (creatorFollowersRes.data || []).map((item: any) => ({
      id: item.id,
      follower_id: item.follower_id,
      follower_type: 'creator',
      created_at: item.created_at,
      profile: item.photographers as FollowerProfile | null,
    }));

    const followers = [...attendeeFollowers, ...creatorFollowers]
      .filter((item) => item.profile?.id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    return NextResponse.json({
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        face_tag: profile.face_tag,
        profile_photo_url: profile.profile_photo_url,
        public_profile_slug: profile.public_profile_slug,
      },
      followers,
      total: followers.length,
      type: queryType || 'followers',
    });
  } catch (error) {
    console.error('Get attendee followers error:', error);
    return NextResponse.json({ error: 'Failed to load followers' }, { status: 500 });
  }
}
