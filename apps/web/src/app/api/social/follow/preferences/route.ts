/**
 * Follow Preferences API
 * 
 * Update notification preferences for follows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const updates: Record<string, boolean> = {};
    if (typeof notifyNewEvent === 'boolean') {
      updates.notify_new_event = notifyNewEvent;
    }
    if (typeof notifyPhotoDrop === 'boolean') {
      updates.notify_photo_drop = notifyPhotoDrop;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No preferences to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('follows')
      .update(updates)
      .eq('follower_id', user.id)
      .eq('following_id', photographerId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update follow preferences error:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}
