import { redirect, notFound } from 'next/navigation';

import { createServiceClient } from '@/lib/supabase/server';

interface ShortLinkPageProps {
  params: { code: string };
  searchParams: { [key: string]: string | undefined };
}

/**
 * Short link redirect
 * Redirects /s/ABC123 to /e/event-slug
 */
export default async function ShortLinkPage({ params, searchParams }: ShortLinkPageProps) {
  const supabase = createServiceClient();
  const code = (() => {
    const rawCode = params.code || '';
    try {
      return decodeURIComponent(rawCode).trim();
    } catch {
      return rawCode.trim();
    }
  })();

  if (!code) {
    notFound();
  }

  // Find event by short link
  const { data: event, error } = await supabase
    .from('events')
    .select('id, public_slug, short_link')
    .ilike('short_link', code)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !event) {
    notFound();
  }

  // Build redirect URL
  const eventIdentifier = event.public_slug || event.short_link || event.id;
  let redirectUrl = `/e/${eventIdentifier}`;
  
  // Pass through access code if provided
  if (searchParams.code) {
    redirectUrl += `?code=${searchParams.code}`;
  }

  redirect(redirectUrl);
}
