import { Metadata } from 'next';

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

    // Find event by slug
    let query = supabase
      .from('events')
      .select(`
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
      `)
      .eq('status', 'active');

    if (isUuid) {
      query = query.eq('id', normalizedSlug);
    } else {
      query = query.or(`public_slug.eq.${normalizedSlug},short_link.eq.${normalizedSlug}`);
    }

    let { data: event } = await query.maybeSingle();

    if (!event && !isUuid) {
      const { data: fallbackEvent } = await supabase
        .from('events')
        .select(`
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
        `)
        .eq('status', 'active')
        .or(`public_slug.ilike.${normalizedSlug},short_link.ilike.${normalizedSlug}`)
        .maybeSingle();

      event = fallbackEvent;
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
      ? supabase.storage.from('covers').getPublicUrl(coverPath).data.publicUrl ||
        supabase.storage.from('events').getPublicUrl(coverPath).data.publicUrl
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
