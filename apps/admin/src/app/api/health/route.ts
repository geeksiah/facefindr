import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  checks.env = {
    status: supabaseUrl && serviceKey ? 'ok' : 'error',
    error: !supabaseUrl 
      ? 'Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)' 
      : !serviceKey 
        ? 'Missing SUPABASE_SERVICE_ROLE_KEY' 
        : undefined,
  };

  // Check database connection
  try {
    const { error } = await supabaseAdmin.from('admin_users').select('count').limit(1);
    if (error) {
      checks.database = { status: 'error', error: error.message };
    } else {
      checks.database = { status: 'ok' };
    }
  } catch (e) {
    checks.database = { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' };
  }

  // Check if admin_users table has data
  try {
    const { data, error } = await supabaseAdmin.from('admin_users').select('email').limit(1);
    if (error) {
      checks.adminUsers = { status: 'error', error: error.message };
    } else if (!data || data.length === 0) {
      checks.adminUsers = { status: 'warning', error: 'No admin users found. Run migrations to create default admin.' };
    } else {
      checks.adminUsers = { status: 'ok' };
    }
  } catch (e) {
    checks.adminUsers = { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return NextResponse.json({
    status: allOk ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
