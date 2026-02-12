export const dynamic = 'force-dynamic';

/**
 * Logout API Route
 * 
 * Signs out the current user and redirects to home.
 */

import { NextResponse } from 'next/server';

import { getAppUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const appUrl = getAppUrl();
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    
    // Redirect to home page
    return NextResponse.redirect(new URL('/', appUrl));
  } catch (error) {
    console.error('Logout error:', error);
    // Still redirect even on error
    return NextResponse.redirect(new URL('/', appUrl));
  }
}

export async function POST() {
  return GET();
}

