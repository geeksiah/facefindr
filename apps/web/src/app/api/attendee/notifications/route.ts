export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// GET ATTENDEE NOTIFICATIONS
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, return empty notifications
    // In a full implementation, you'd have a notifications table
    return NextResponse.json({
      notifications: [],
    });

  } catch (error) {
    console.error('Failed to get notifications:', error);
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500 }
    );
  }
}

