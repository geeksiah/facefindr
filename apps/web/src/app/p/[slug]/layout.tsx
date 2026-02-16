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
      title: 'Creator | Ferchr',
      description: 'Find event creators on Ferchr',
    };
  }

  const displayName = photographer.display_name || 'Ferchr Creator';
  const profileImage = photographer.profile_photo_url || `${APP_URL}/og-default.png`;
  const bio = photographer.bio || `Professional event creator on Ferchr.`;
  const description = `${bio} FaceTag: ${photographer.face_tag}. Book for your events and let attendees find their photos instantly.`;
  
  // Generate OG image URL
  const ogImageUrl = `${APP_URL}/api/og/profile?faceTag=${encodeURIComponent(photographer.face_tag || '')}&name=${encodeURIComponent(displayName)}${photographer.profile_photo_url ? `&photo=${encodeURIComponent(photographer.profile_photo_url)}` : ''}`;

  return {
    title: `${displayName} | Ferchr Creator`,
    description,
    openGraph: {
      title: `${displayName} - Creator on Ferchr`,
      description,
      url: `${APP_URL}/c/${slug}`,
      siteName: 'Ferchr',
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
          alt: `${displayName} on Ferchr`,
        },
      ],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${displayName} - Creator on Ferchr`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function CreatorProfileLayout({ children }: Props) {
  return <>{children}</>;
}
