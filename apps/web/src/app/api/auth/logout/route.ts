export const dynamic = 'force-dynamic';

/**
 * Logout API Route
 * 
 * Signs out the current user and redirects to home.
 */

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    
    // Redirect to home page
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  } catch (error) {
    console.error('Logout error:', error);
    // Still redirect even on error
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  }
}

export async function POST() {
  return GET();
}

