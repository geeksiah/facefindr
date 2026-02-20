export const dynamic = 'force-dynamic';

/**
 * Follow Preferences API
 * 
 * Update notification preferences for follows.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function uniqueStringValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

async function resolveCreatorFollowIdentifiers(supabase: any, identifier: string) {
  const withUserId = await supabase
    .from('photographers')
    .select('id, user_id')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier},user_id.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return uniqueStringValues([withUserId.data?.id, (withUserId.data as any)?.user_id, identifier]);
  }

  const fallback = await supabase
    .from('photographers')
    .select('id')
    .or(`id.eq.${identifier},public_profile_slug.eq.${identifier}`)
    .limit(1)
    .maybeSingle();

  return uniqueStringValues([fallback.data?.id, identifier]);
}

// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId, notifyNewEvent, notifyPhotoDrop } = body;

    if (!photographerId) {
      return NextResponse.json({ error: 'Creator ID required' }, { status: 400 });
    }

    const updateData: Record<string, boolean> = {};
    if (typeof notifyNewEvent === 'boolean') {
      updateData.notify_new_event = notifyNewEvent;
    }
    if (typeof notifyPhotoDrop === 'boolean') {
      updateData.notify_photo_drop = notifyPhotoDrop;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No preferences to update' }, { status: 400 });
    }

    const followingIdCandidates = await resolveCreatorFollowIdentifiers(supabase, photographerId);

    let updateQuery = supabase
      .from('follows')
      .update(updateData)
      .eq('follower_id', user.id)
      .in('following_type', ['creator', 'photographer']);

    if (followingIdCandidates.length === 1) {
      updateQuery = updateQuery.eq('following_id', followingIdCandidates[0]);
    } else {
      updateQuery = updateQuery.in('following_id', followingIdCandidates);
    }

    const { error } = await updateQuery;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}

