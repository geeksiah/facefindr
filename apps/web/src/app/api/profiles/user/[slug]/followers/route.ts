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

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function addProfileLookupEntry(map: Map<string, any>, profile: any) {
  if (!profile?.id) return;
  map.set(profile.id, profile);
}

async function fetchAttendeeProfilesByIdentifiers(supabase: any, identifiers: string[]) {
  const ids = uniqueStringValues(identifiers);
  const lookup = new Map<string, any>();
  if (!ids.length) return lookup;

  const idRows = await supabase
    .from('attendees')
    .select('id, display_name, face_tag, profile_photo_url, public_profile_slug')
    .in('id', ids);

  if (Array.isArray(idRows.data)) {
    for (const row of idRows.data) addProfileLookupEntry(lookup, row);
  }

  return lookup;
}

async function fetchCreatorProfilesByIdentifiers(supabase: any, identifiers: string[]) {
  const ids = uniqueStringValues(identifiers);
  const lookup = new Map<string, any>();
  if (!ids.length) return lookup;

  const idRows = await supabase
    .from('photographers')
    .select('id, display_name, face_tag, profile_photo_url, public_profile_slug')
    .in('id', ids);

  if (Array.isArray(idRows.data)) {
    for (const row of idRows.data) addProfileLookupEntry(lookup, row);
  }

  return lookup;
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
      'id, display_name, face_tag, profile_photo_url, is_public_profile, public_profile_slug';

    const queryProfile = async () => {
      let q = supabase
        .from('attendees')
        .select(fullSelect);

      if (isUuid(slug)) {
        q = q.eq('id', slug);
      } else if (isFaceTag(slug)) {
        q = q.eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`);
      } else {
        q = q.eq('public_profile_slug', slug);
      }

      return q.maybeSingle();
    };

    let { data: profile, error } = await queryProfile();

    if (!profile && !error && !isUuid(slug) && !isFaceTag(slug)) {
      const { data: byFaceTag, error: byFaceTagError } = await supabase
        .from('attendees')
        .select(fullSelect)
        .eq('face_tag', slug.startsWith('@') ? slug : `@${slug}`)
        .maybeSingle();
      profile = byFaceTagError ? null : byFaceTag;
    }

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const ownerUserId = profile.id;
    const followTargetIds = uniqueStringValues([ownerUserId, profile.id]);

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
        created_at
      `)
      .eq('following_type', 'attendee')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (followTargetIds.length === 1) {
      followersQuery = followersQuery.eq('following_id', followTargetIds[0]);
    } else {
      followersQuery = followersQuery.in('following_id', followTargetIds);
    }

    const { data: followerRows, error: followerRowsError } = await followersQuery;
    if (followerRowsError) {
      throw followerRowsError;
    }

    const rows = followerRows || [];
    const attendeeFollowerIds = rows
      .filter((row: any) => row.follower_type === 'attendee')
      .map((row: any) => row.follower_id);
    const creatorFollowerIds = rows
      .filter((row: any) => row.follower_type === 'creator' || row.follower_type === 'photographer')
      .map((row: any) => row.follower_id);

    const [attendeeLookup, creatorLookup] = await Promise.all([
      fetchAttendeeProfilesByIdentifiers(supabase, attendeeFollowerIds),
      fetchCreatorProfilesByIdentifiers(supabase, creatorFollowerIds),
    ]);

    const followers = rows
      .map((row: any) => {
        const isCreatorFollower =
          row.follower_type === 'creator' || row.follower_type === 'photographer';
        const profile = isCreatorFollower
          ? creatorLookup.get(row.follower_id) || {
              id: row.follower_id,
              display_name: 'Creator',
              face_tag: null,
              profile_photo_url: null,
              public_profile_slug: null,
            }
          : attendeeLookup.get(row.follower_id) || {
              id: row.follower_id,
              display_name: 'Attendee',
              face_tag: null,
              profile_photo_url: null,
              public_profile_slug: null,
            };

        return {
          id: row.id,
          follower_id: row.follower_id,
          follower_type: isCreatorFollower ? 'creator' : 'attendee',
          created_at: row.created_at,
          profile: profile as FollowerProfile,
        };
      })
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
