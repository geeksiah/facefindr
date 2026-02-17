export const dynamic = 'force-dynamic';

/**
 * Social Search API
 * 
 * Search for photographers and users by FaceTag or name.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

function isSchemaCompatibilityError(error: any): boolean {
  return error?.code === '42703' || error?.code === '42P01';
}

function scoreSearchMatch(faceTag: string | null | undefined, displayName: string | null | undefined, normalizedQuery: string) {
  const normalizedFaceTag = (faceTag || '').toLowerCase().replace(/^@/, '');
  const normalizedName = (displayName || '').toLowerCase();

  if (normalizedFaceTag === normalizedQuery) return 0;
  if (normalizedFaceTag.startsWith(normalizedQuery)) return 1;
  if (normalizedName.startsWith(normalizedQuery)) return 2;
  if (normalizedFaceTag.includes(normalizedQuery)) return 3;
  if (normalizedName.includes(normalizedQuery)) return 4;
  return 10;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }

  return output;
}

export async function GET(request: NextRequest) {
  try {
    const serviceClient = createServiceClient();
    const { searchParams } = new URL(request.url);
    
    const query = searchParams.get('q');
    const type = searchParams.get('type') || 'all'; // 'all', 'photographers', 'users'
    const rawLimit = parseInt(searchParams.get('limit') || '20');
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    // Clean search term
    const searchTerm = query.replace('@', '').trim().toLowerCase();
    const safeSearchTerm = searchTerm.replace(/[,%()]/g, ' ').trim();
    if (!searchTerm) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }
    if (!safeSearchTerm) {
      return NextResponse.json({ photographers: [], users: [] });
    }

    const results: any = { photographers: [], users: [] };
    const exactFaceTag = `@${searchTerm}`;

    // Search photographers
    if (type === 'all' || type === 'photographers') {
      // Exact facetag match: return even if profile is not public
      const exactPhotographersQuery = await serviceClient
        .from('photographers')
        .select(`
          id, display_name, face_tag, profile_photo_url, bio,
          follower_count, public_profile_slug, is_public_profile, allow_follows
        `)
        .eq('face_tag', exactFaceTag)
        .limit(1);

      const photographersQuery = await serviceClient
        .from('photographers')
        .select(`
          id, display_name, face_tag, profile_photo_url, bio, 
          follower_count, public_profile_slug, is_public_profile, allow_follows
        `)
        .eq('is_public_profile', true)
        .or(`face_tag.ilike.%${safeSearchTerm}%,display_name.ilike.%${safeSearchTerm}%`)
        .order('follower_count', { ascending: false })
        .limit(Math.min(limit * 3, 100));

      let exactPhotographers = exactPhotographersQuery.data || [];
      let photographers = photographersQuery.data || [];

      if (exactPhotographersQuery.error || photographersQuery.error) {
        const compatibilityError = exactPhotographersQuery.error || photographersQuery.error;

        if (isSchemaCompatibilityError(compatibilityError)) {
          const exactFallbackQuery = await serviceClient
            .from('photographers')
            .select('id, display_name, face_tag, profile_photo_url, bio')
            .eq('face_tag', exactFaceTag)
            .limit(1);

          const fallbackQuery = await serviceClient
            .from('photographers')
            .select('id, display_name, face_tag, profile_photo_url, bio')
            .or(`face_tag.ilike.%${safeSearchTerm}%,display_name.ilike.%${safeSearchTerm}%`)
            .limit(Math.min(limit * 3, 100));

          exactPhotographers = exactFallbackQuery.data || [];
          photographers = fallbackQuery.data || [];
        } else {
          console.error('Photographer search query error:', exactPhotographersQuery.error || photographersQuery.error);
        }
      }

      const creatorCandidates = dedupeById([...(exactPhotographers || []), ...(photographers || [])]);
      const creatorIds = creatorCandidates.map((p: any) => p.id);

      const { data: creatorPrivacy } = creatorIds.length
        ? await serviceClient
            .from('user_privacy_settings')
            .select('user_id, show_in_search')
            .in('user_id', creatorIds)
        : { data: [] as any[] };

      const hiddenCreatorIds = new Set(
        (creatorPrivacy || [])
          .filter((setting: any) => setting.show_in_search === false)
          .map((setting: any) => setting.user_id)
      );

      results.photographers = creatorCandidates
        .filter((p: any) => !hiddenCreatorIds.has(p.id))
        .sort((a: any, b: any) => {
          const scoreDiff = scoreSearchMatch(a.face_tag, a.display_name, searchTerm) - scoreSearchMatch(b.face_tag, b.display_name, searchTerm);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.follower_count || 0) - (a.follower_count || 0);
        })
        .slice(0, limit)
        .map((p: any) => ({
          ...p,
          userType: 'photographer',
        }));
    }

    // Search users/attendees (only if they have public profiles)
    if (type === 'all' || type === 'users') {
      // Exact facetag match: return even if profile is not public
      const exactUsersQuery = await serviceClient
        .from('attendees')
        .select(`
          id, display_name, face_tag, profile_photo_url,
          public_profile_slug, is_public_profile, following_count
        `)
        .eq('face_tag', exactFaceTag)
        .limit(1);

      const usersQuery = await serviceClient
        .from('attendees')
        .select(`
          id, display_name, face_tag, profile_photo_url, 
          public_profile_slug, is_public_profile, following_count
        `)
        .eq('is_public_profile', true)
        .or(`face_tag.ilike.%${safeSearchTerm}%,display_name.ilike.%${safeSearchTerm}%`)
        .limit(Math.min(limit * 3, 100));

      let exactUsers = exactUsersQuery.data || [];
      let users = usersQuery.data || [];

      if (exactUsersQuery.error || usersQuery.error) {
        const compatibilityError = exactUsersQuery.error || usersQuery.error;

        if (isSchemaCompatibilityError(compatibilityError)) {
          const exactFallbackQuery = await serviceClient
            .from('attendees')
            .select('id, display_name, face_tag, profile_photo_url')
            .eq('face_tag', exactFaceTag)
            .limit(1);

          const fallbackQuery = await serviceClient
            .from('attendees')
            .select('id, display_name, face_tag, profile_photo_url')
            .or(`face_tag.ilike.%${safeSearchTerm}%,display_name.ilike.%${safeSearchTerm}%`)
            .limit(Math.min(limit * 3, 100));

          exactUsers = exactFallbackQuery.data || [];
          users = fallbackQuery.data || [];
        } else {
          console.error('Attendee search query error:', exactUsersQuery.error || usersQuery.error);
        }
      }

      const attendeeCandidates = dedupeById([...(exactUsers || []), ...(users || [])]);
      const attendeeIds = attendeeCandidates.map((u: any) => u.id);

      const { data: attendeePrivacy } = attendeeIds.length
        ? await serviceClient
            .from('user_privacy_settings')
            .select('user_id, show_in_search')
            .in('user_id', attendeeIds)
        : { data: [] as any[] };

      const hiddenAttendeeIds = new Set(
        (attendeePrivacy || [])
          .filter((setting: any) => setting.show_in_search === false)
          .map((setting: any) => setting.user_id)
      );

      results.users = attendeeCandidates
        .filter((u: any) => !hiddenAttendeeIds.has(u.id))
        .sort((a: any, b: any) => {
          const scoreDiff = scoreSearchMatch(a.face_tag, a.display_name, searchTerm) - scoreSearchMatch(b.face_tag, b.display_name, searchTerm);
          if (scoreDiff !== 0) return scoreDiff;
          return (b.following_count || 0) - (a.following_count || 0);
        })
        .slice(0, limit)
        .map((u: any) => ({
          ...u,
          userType: 'attendee',
        }));
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

