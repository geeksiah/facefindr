import { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface Props {
  params: { slug: string };
  children: React.ReactNode;
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = params.slug;
  
  const supabase = await createClient();
  
  // Try to find event by custom slug first
  let { data: shareLink } = await supabase
    .from('event_share_links')
    .select('event_id')
    .eq('custom_slug', slug)
    .eq('is_active', true)
    .single();

  let eventId = shareLink?.event_id;

  // If not found, try UUID directly
  if (!eventId) {
    eventId = slug;
  }

  // Fetch event data
  const { data: event } = await supabase
    .from('events')
    .select(`
      id,
      name,
      description,
      event_date,
      location,
      cover_image_url,
      photographers:photographer_id (
        display_name,
        profile_photo_url
      )
    `)
    .eq('id', eventId)
    .single();

  // Get photo count
  const { count: photoCount } = await supabase
    .from('media')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (!event) {
    return {
      title: 'Event | FaceFindr',
      description: 'Find your photos from this event on FaceFindr',
    };
  }

  const eventName = event.name || 'Event';
  const photographerName = (event.photographers as any)?.display_name || 'Photographer';
  const eventDate = event.event_date 
    ? new Date(event.event_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';
  const description = event.description || `Find your photos from ${eventName} on FaceFindr. ${photoCount || 0} photos captured by ${photographerName}.`;
  
  // Generate OG image URL
  const ogImageUrl = `${APP_URL}/api/og/event?name=${encodeURIComponent(eventName)}&date=${encodeURIComponent(eventDate)}&photographer=${encodeURIComponent(photographerName)}&photos=${photoCount || 0}${event.cover_image_url ? `&cover=${encodeURIComponent(event.cover_image_url)}` : ''}`;

  return {
    title: `${eventName} | FaceFindr`,
    description,
    openGraph: {
      title: eventName,
      description,
      url: `${APP_URL}/e/${slug}`,
      siteName: 'FaceFindr',
      images: [
        {
          url: event.cover_image_url || ogImageUrl,
          width: 1200,
          height: 630,
          alt: eventName,
        },
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${eventName} on FaceFindr`,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: eventName,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function EventLayout({ children }: Props) {
  return <>{children}</>;
}
