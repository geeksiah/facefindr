export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, redirectTo: '/login' });
  } catch (error: any) {
    console.error('Logout-all error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to log out from all devices' },
      { status: 500 }
    );
  }
}

