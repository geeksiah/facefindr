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
  const faceTag = `@${slug}`;
  
  const supabase = await createClient();
  
  // Try to find photographer by face_tag or public profile slug
  const { data: photographer } = await supabase
    .from('photographers')
    .select('id, display_name, profile_photo_url, face_tag, bio')
    .or(`face_tag.eq.${faceTag},public_profile_slug.eq.${slug}`)
    .single();

  if (!photographer) {
    return {
      title: 'Photographer | FaceFindr',
      description: 'Find event photographers on FaceFindr',
    };
  }

  const displayName = photographer.display_name || 'FaceFindr Photographer';
  const profileImage = photographer.profile_photo_url || `${APP_URL}/og-default.png`;
  const bio = photographer.bio || `Professional event photographer on FaceFindr.`;
  const description = `${bio} FaceTag: ${photographer.face_tag}. Book for your events and let attendees find their photos instantly.`;
  
  // Generate OG image URL
  const ogImageUrl = `${APP_URL}/api/og/profile?faceTag=${encodeURIComponent(photographer.face_tag || '')}&name=${encodeURIComponent(displayName)}${photographer.profile_photo_url ? `&photo=${encodeURIComponent(photographer.profile_photo_url)}` : ''}`;

  return {
    title: `${displayName} | FaceFindr Photographer`,
    description,
    openGraph: {
      title: `${displayName} - Photographer on FaceFindr`,
      description,
      url: `${APP_URL}/p/${slug}`,
      siteName: 'FaceFindr',
      images: [
        {
          url: profileImage,
          width: 400,
          height: 400,
          alt: `${displayName}'s profile photo`,
        },
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${displayName} on FaceFindr`,
        },
      ],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} - Photographer on FaceFindr`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function PhotographerProfileLayout({ children }: Props) {
  return <>{children}</>;
}
