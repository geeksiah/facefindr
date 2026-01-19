/**
 * Follow Preferences API
 * 
 * Update notification preferences for follows.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// PUT - Update notification preferences
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { photographerId, notifyNewEvent, notifyPhotoDrop } = body;

    if (!photographerId) {
      return NextResponse.json({ error: 'Photographer ID required' }, { status: 400 });
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

    const { error } = await supabase
      .from('follows')
      .update(updateData)
      .eq('follower_id', user.id)
      .eq('following_id', photographerId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
