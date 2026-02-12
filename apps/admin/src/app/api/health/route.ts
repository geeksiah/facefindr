import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {
    server: 'ok',
    database: 'error',
    env: 'error',
  };

  // Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_JWT_SECRET',
  ];

  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
  checks.env = missingEnvVars.length === 0 ? 'ok' : 'error';

  // Check database connection
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('photographers')
      .select('id')
      .limit(1);

    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }

  const allOk = Object.values(checks).every((status) => status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
      version: process.env.npm_package_version || '0.1.0',
    },
    {
      status: allOk ? 200 : 503,
    }
  );
}
