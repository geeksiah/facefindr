export const dynamic = 'force-dynamic';

/**
 * Logout API Route
 * 
 * Signs out the current user and redirects to home.
 */

import { NextResponse } from 'next/server';

import { getAppUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

async function performLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function GET() {
  const appUrl = getAppUrl();
  try {
    await performLogout();
    return NextResponse.redirect(new URL('/login', appUrl));
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(new URL('/login', appUrl));
  }
}

export async function POST() {
  try {
    await performLogout();
    return NextResponse.json({ success: true, redirectTo: '/login' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: false, redirectTo: '/login' }, { status: 500 });
  }
}

