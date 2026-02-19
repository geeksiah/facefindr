export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

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
    const supabase = createServiceClient();
    const { slug } = params;
    const queryType = request.nextUrl.searchParams.get('type');

    const fullSelect =
      'id, user_id, display_name, face_tag, profile_photo_url, is_public_profile, public_profile_slug';
    const fallbackSelect =
      'id, display_name, face_tag, profile_photo_url, is_public_profile, public_profile_slug';

    const queryProfile = async (includeUserId: boolean) => {
      let q = supabase
        .from('attendees')
        .select(includeUserId ? fullSelect : fallbackSelect);

      if (isUuid(slug)) {
        q = includeUserId ? q.or(`id.eq.${slug},user_id.eq.${slug}`) : q.eq('id', slug);
      } else if (isFaceTag(slug)) {
        q = q.eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`);
      } else {
        q = q.eq('public_profile_slug', slug);
      }

      return q.maybeSingle();
    };

    let { data: profile, error } = await queryProfile(true);

    if (error && isMissingColumnError(error, 'user_id')) {
      const fallback = await queryProfile(false);
      profile = fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data;
      error = fallback.error;
    }

    if (!profile && !error && !isUuid(slug) && !isFaceTag(slug)) {
      const { data: byFaceTag, error: byFaceTagError } = await supabase
        .from('attendees')
        .select(fullSelect)
        .eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`)
        .maybeSingle();
      if (byFaceTagError && isMissingColumnError(byFaceTagError, 'user_id')) {
        const fallback = await supabase
          .from('attendees')
          .select(fallbackSelect)
          .eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`)
          .maybeSingle();
        profile = fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data;
      } else {
        profile = byFaceTag;
      }
    }

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const ownerUserId = (profile as any).user_id || profile.id;
    const followTargetIds = uniqueStringValues([ownerUserId, profile.id]);

    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || user.id !== ownerUserId) {
      return NextResponse.json({ error: 'Followers list is private' }, { status: 403 });
    }

    const [attendeeFollowersRes, creatorFollowersRes] = await Promise.all([
      (followTargetIds.length === 1
        ? supabase
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
            .eq('following_id', followTargetIds[0])
        : supabase
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
            .in('following_id', followTargetIds))
        .eq('following_type', 'attendee')
        .eq('follower_type', 'attendee')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      (followTargetIds.length === 1
        ? supabase
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
            .eq('following_id', followTargetIds[0])
        : supabase
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
            .in('following_id', followTargetIds))
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
