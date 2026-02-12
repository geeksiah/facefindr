export const dynamic = 'force-dynamic';

/**
 * Social Search API
 * 
 * Search for photographers and users by FaceTag or name.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const query = searchParams.get('q');
    const type = searchParams.get('type') || 'all'; // 'all', 'photographers', 'users'
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Search query too short' }, { status: 400 });
    }

    // Clean search term
    const searchTerm = query.replace('@', '').toLowerCase();
    const results: any = { photographers: [], users: [] };

    // Search photographers
    if (type === 'all' || type === 'photographers') {
      const { data: photographers } = await supabase
        .from('photographers')
        .select(`
          id, display_name, face_tag, profile_photo_url, bio, 
          follower_count, public_profile_slug, is_public_profile
        `)
        .eq('is_public_profile', true)
        .or(`face_tag.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .order('follower_count', { ascending: false })
        .limit(limit);

      results.photographers = photographers || [];
    }

    // Search users/attendees (only if they have public profiles)
    if (type === 'all' || type === 'users') {
      const { data: users } = await supabase
        .from('attendees')
        .select(`
          id, display_name, face_tag, profile_photo_url, 
          public_profile_slug, is_public_profile
        `)
        .eq('is_public_profile', true)
        .or(`face_tag.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(limit);

      results.users = users || [];
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

