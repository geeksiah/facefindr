import { Metadata } from 'next';

import { getStoragePublicUrl } from '@/lib/storage/provider';
import { createServiceClient } from '@/lib/supabase/server';

export async function generateEventMetadata(slug: string): Promise<Metadata> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ferchr.app';
  const normalizedSlug = (() => {
    const rawSlug = slug || '';
    try {
      return decodeURIComponent(rawSlug).trim();
    } catch {
      return rawSlug.trim();
    }
  })();

  try {
    const supabase = createServiceClient();
    if (!normalizedSlug) {
      return {
        title: 'Ferchr Event',
        description: 'Find your event photos on Ferchr',
      };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedSlug);

    const eventSelect = `
        id,
        name,
        description,
        cover_image_url,
        event_date,
        location,
        is_public,
        is_publicly_listed,
        require_access_code,
        photographers (display_name, profile_photo_url)
      `;

    let event: any = null;

    if (isUuid) {
      const byId = await supabase
        .from('events')
        .select(eventSelect)
        .eq('status', 'active')
        .eq('id', normalizedSlug)
        .maybeSingle();
      event = byId.data;
    } else {
      const byPublicSlug = await supabase
        .from('events')
        .select(eventSelect)
        .eq('status', 'active')
        .eq('public_slug', normalizedSlug)
        .maybeSingle();

      event = byPublicSlug.data;

      if (!event) {
        const byShortLink = await supabase
          .from('events')
          .select(eventSelect)
          .eq('status', 'active')
          .eq('short_link', normalizedSlug)
          .maybeSingle();
        event = byShortLink.data;
      }

      if (!event) {
        const lower = normalizedSlug.toLowerCase();
        const upper = normalizedSlug.toUpperCase();
        const variants = Array.from(new Set([normalizedSlug, lower, upper]));

        if (variants.length > 1) {
          const byPublicSlugVariants = await supabase
            .from('events')
            .select(eventSelect)
            .eq('status', 'active')
            .in('public_slug', variants)
            .maybeSingle();

          event = byPublicSlugVariants.data;

          if (!event) {
            const byShortLinkVariants = await supabase
              .from('events')
              .select(eventSelect)
              .eq('status', 'active')
              .in('short_link', variants)
              .maybeSingle();
            event = byShortLinkVariants.data;
          }
        }
      }
    }

    if (!event) {
      return {
        title: 'Ferchr Event',
        description: 'Find your event photos on Ferchr',
      };
    }

    const photographer = event.photographers as any;
    const eventUrl = `${baseUrl}/e/${normalizedSlug}`;
    const coverPath = event.cover_image_url?.startsWith('/')
      ? event.cover_image_url.slice(1)
      : event.cover_image_url;
    const coverImage = coverPath?.startsWith('http')
      ? coverPath
      : coverPath
      ? getStoragePublicUrl('covers', coverPath) || getStoragePublicUrl('events', coverPath)
      : `${baseUrl}/assets/logos/og-logo.png`;
    const description = event.description || `Find your photos from ${event.name} on Ferchr`;
    const isRestricted = event.is_public === false || event.is_publicly_listed === false || event.require_access_code === true;

    return {
      title: event.name,
      description,
      robots: {
        index: !isRestricted,
        follow: !isRestricted,
      },
      keywords: [
        'Ferchr',
        'event photos',
        event.name,
        event.location || '',
        photographer?.display_name || '',
      ].filter(Boolean),
      openGraph: {
        type: 'website',
        url: eventUrl,
        title: event.name,
        description,
        siteName: 'Ferchr',
        images: [
          {
            url: coverImage,
            width: 1200,
            height: 630,
            alt: event.name,
          },
        ],
        locale: 'en_US',
      },
      twitter: {
        card: 'summary_large_image',
        title: event.name,
        description,
        images: [coverImage],
      },
      alternates: {
        canonical: eventUrl,
      },
    };
  } catch (error) {
    console.error('Error generating event metadata:', error);
    return {
      title: 'Event',
      description: 'Find your event photos on Ferchr',
    };
  }
}
