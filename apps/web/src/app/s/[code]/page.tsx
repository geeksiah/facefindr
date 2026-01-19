import { redirect, notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

interface ShortLinkPageProps {
  params: { code: string };
  searchParams: { [key: string]: string | undefined };
}

/**
 * Short link redirect
 * Redirects /s/ABC123 to /e/event-slug
 */
export default async function ShortLinkPage({ params, searchParams }: ShortLinkPageProps) {
  const supabase = await createClient();
  const { code } = params;

  // Find event by short link
  const { data: event, error } = await supabase
    .from('events')
    .select('public_slug, short_link, require_access_code, public_access_code')
    .eq('short_link', code)
    .eq('status', 'active')
    .single();

  if (error || !event || !event.public_slug) {
    notFound();
  }

  // Build redirect URL
  let redirectUrl = `/e/${event.public_slug}`;
  
  // Pass through access code if provided
  if (searchParams.code) {
    redirectUrl += `?code=${searchParams.code}`;
  }

  redirect(redirectUrl);
}
