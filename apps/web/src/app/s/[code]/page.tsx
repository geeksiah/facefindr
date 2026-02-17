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

  // Find event by short link (exact match first)
  let { data: event, error } = await supabase
    .from('events')
    .select('id, public_slug, short_link')
    .eq('short_link', code)
    .eq('status', 'active')
    .maybeSingle();

  // Fallback for case variants.
  if (!event && !error) {
    const lower = code.toLowerCase();
    const upper = code.toUpperCase();
    const variants = Array.from(new Set([code, lower, upper]));

    if (variants.length > 1) {
      const fallback = await supabase
        .from('events')
        .select('id, public_slug, short_link')
        .in('short_link', variants)
        .eq('status', 'active')
        .maybeSingle();
      event = fallback.data;
      error = fallback.error;
    }
  }

  if (error || !event) {
    notFound();
  }

  // Build redirect URL
  const eventIdentifier = event.public_slug || event.id;
  let redirectUrl = `/e/${eventIdentifier}`;
  
  // Pass through access code if provided
  if (searchParams.code) {
    redirectUrl += `?code=${searchParams.code}`;
  }

  redirect(redirectUrl);
}
