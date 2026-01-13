import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// GET NOTIFICATION SETTINGS
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Default settings - in a full implementation, these would be stored in DB
    return NextResponse.json({
      photoMatches: true,
      newEvents: true,
      eventUpdates: true,
      emailNotifications: true,
      pushNotifications: false,
    });

  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings' },
      { status: 500 }
    );
  }
}

// ============================================
// UPDATE NOTIFICATION SETTINGS
// ============================================

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await request.json();

    // In a full implementation, save to database
    // For now, just acknowledge the update
    
    return NextResponse.json({ success: true, ...settings });

  } catch (error) {
    console.error('Failed to update notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
