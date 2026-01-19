/**
 * Health Check API
 * 
 * Returns the health status of the application and its dependencies.
 * Used by load balancers, monitoring tools, and deployment systems.
 */

import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      latencyMs?: number;
    };
    storage: {
      status: 'up' | 'down';
    };
    environment: {
      nodeEnv: string;
      hasSupabaseUrl: boolean;
      hasSupabaseKey: boolean;
      hasStripeKey: boolean;
      hasAwsConfig: boolean;
    };
  };
}

const startTime = Date.now();

export async function GET() {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const health: HealthStatus = {
    status: 'healthy',
    timestamp,
    version: process.env.npm_package_version || '1.0.0',
    uptime,
    checks: {
      database: { status: 'down' },
      storage: { status: 'down' },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        hasAwsConfig: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  };

  // Check database connection
  try {
    const startDb = Date.now();
    const supabase = createServiceClient();
    const { error } = await supabase.from('subscription_plans').select('code').limit(1);
    
    if (!error) {
      health.checks.database = {
        status: 'up',
        latencyMs: Date.now() - startDb,
      };
    }
  } catch {
    health.checks.database = { status: 'down' };
  }

  // Check storage
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.storage.getBucket('media');
    health.checks.storage = { status: error ? 'down' : 'up' };
  } catch {
    health.checks.storage = { status: 'down' };
  }

  // Determine overall status
  if (health.checks.database.status === 'down') {
    health.status = 'unhealthy';
  } else if (health.checks.storage.status === 'down') {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(health, { 
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

// Simple liveness check - just confirms the server is running
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
