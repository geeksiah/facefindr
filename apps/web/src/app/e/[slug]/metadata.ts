import { Metadata } from 'next';

import { createServiceClient } from '@/lib/supabase/server';

export async function generateEventMetadata(slug: string): Promise<Metadata> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://facefindr.app';

  try {
    const supabase = createServiceClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

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
      query = query.eq('id', slug);
    } else {
      query = query.or(`public_slug.eq.${slug},short_link.eq.${slug}`);
    }

    const { data: event } = await query.maybeSingle();

    if (!event) {
      return {
        title: 'FaceFindr Event',
        description: 'Find your event photos on FaceFindr',
      };
    }

    const photographer = event.photographers as any;
    const eventUrl = `${baseUrl}/e/${slug}`;
    const coverImage = event.cover_image_url || `${baseUrl}/assets/logos/og-logo.png`;
    const description = event.description || `Find your photos from ${event.name} on FaceFindr`;
    const isRestricted = event.is_public === false || event.is_publicly_listed === false || event.require_access_code === true;

    return {
      title: event.name,
      description,
      robots: {
        index: !isRestricted,
        follow: !isRestricted,
      },
      keywords: [
        'FaceFindr',
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
        siteName: 'FaceFindr',
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
      description: 'Find your event photos on FaceFindr',
    };
  }
}
