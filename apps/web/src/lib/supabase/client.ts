import type { Database } from '@facefind/shared/types';
import { createBrowserClient } from '@supabase/ssr';


export function createClient(): any {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any;
}
