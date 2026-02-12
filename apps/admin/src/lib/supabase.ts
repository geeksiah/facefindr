/**
 * Supabase Client for Admin Dashboard
 * 
 * Uses service role key for elevated access - bypasses RLS
 * IMPORTANT: Only use server-side, never expose to client
 */

import { createClient } from '@supabase/supabase-js';

// Support both naming conventions for flexibility
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase ENV check:', {
    hasUrl: !!supabaseUrl,
    hasServiceKey: !!supabaseServiceKey,
    urlEnvName: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'NEXT_PUBLIC_SUPABASE_URL' : 'SUPABASE_URL',
  });
  throw new Error(
    `Missing Supabase environment variables. ` +
    `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'set' : 'MISSING'}, ` +
    `SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'set' : 'MISSING'}`
  );
}

// Service role client - bypasses RLS, full database access
// IMPORTANT: Service role key must start with 'eyJ' (JWT format)
// If using anon key by mistake, RLS will still apply
// Service role key bypasses ALL RLS policies automatically
export const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceKey!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Realtime client for subscriptions
export function createRealtimeClient() {
  return createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

// Types for admin queries
export type AdminRole = 'super_admin' | 'finance_admin' | 'support_admin' | 'readonly_admin';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string | null;
  admin_email: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  updated_at: string;
}
