import { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

export async function generateEventMetadata(slug: string): Promise<Metadata> {
  const supabase = createClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://facefindr.app';

  try {
    // Find event by slug
    const { data: event } = await supabase
      .from('events')
      .select(`
        id,
        name,
        description,
        cover_image_url,
        event_date,
        location,
        photographers (display_name, profile_photo_url)
      `)
      .or(`public_slug.eq.${slug},short_link.eq.${slug}`)
      .eq('status', 'active')
      .single();

    if (!event) {
      return {
        title: 'Event Not Found',
        description: 'The event you are looking for could not be found.',
      };
    }

    const photographer = event.photographers as any;
    const eventUrl = `${baseUrl}/e/${slug}`;
    const coverImage = event.cover_image_url || `${baseUrl}/assets/logos/og-logo.png`;

    return {
      title: event.name,
      description: event.description || `Find your photos from ${event.name} on FaceFindr`,
      openGraph: {
        type: 'website',
        url: eventUrl,
        title: event.name,
        description: event.description || `Find your photos from ${event.name} on FaceFindr`,
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
        description: event.description || `Find your photos from ${event.name} on FaceFindr`,
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
