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
  
  // Try to find attendee by face_tag or public profile slug
  const { data: attendee } = await supabase
    .from('attendees')
    .select('id, display_name, profile_photo_url, face_tag')
    .or(`face_tag.eq.${faceTag},public_profile_slug.eq.${slug}`)
    .single();

  if (!attendee) {
    return {
      title: 'Profile | Ferchr',
      description: 'Find your photos from events on Ferchr',
    };
  }

  const displayName = attendee.display_name || 'Ferchr User';
  const profileImage = attendee.profile_photo_url || `${APP_URL}/og-default.png`;
  const description = `Connect with ${displayName} on Ferchr. FaceTag: ${attendee.face_tag}. Find and share event photos with AI-powered face recognition.`;
  
  // Generate OG image URL
  const ogImageUrl = `${APP_URL}/api/og/profile?faceTag=${encodeURIComponent(attendee.face_tag || '')}&name=${encodeURIComponent(displayName)}${attendee.profile_photo_url ? `&photo=${encodeURIComponent(attendee.profile_photo_url)}` : ''}`;

  return {
    title: `${displayName} | Ferchr`,
    description,
    openGraph: {
      title: `${displayName} on Ferchr`,
      description,
      url: `${APP_URL}/u/${slug}`,
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
      title: `${displayName} on Ferchr`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function UserProfileLayout({ children }: Props) {
  return <>{children}</>;
}
