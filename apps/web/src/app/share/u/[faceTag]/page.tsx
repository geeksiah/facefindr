import { QrCode, ArrowRight, User } from 'lucide-react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { createClient } from '@/lib/supabase/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface Props {
  params: { faceTag: string };
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const faceTag = `@${params.faceTag}`;
  
  const supabase = await createClient();
  
  // Try to find attendee
  const { data: attendee } = await supabase
    .from('attendees')
    .select('display_name, profile_photo_url, face_tag')
    .eq('face_tag', faceTag)
    .single();

  const displayName = attendee?.display_name || 'Ferchr User';
  const profileImage = attendee?.profile_photo_url || `${APP_URL}/og-default.png`;
  
  return {
    title: `${displayName} on Ferchr`,
    description: `Connect with ${displayName} on Ferchr. FaceTag: ${faceTag}. Find and share event photos with AI-powered face recognition.`,
    openGraph: {
      title: `${displayName} on Ferchr`,
      description: `Connect with ${displayName} on Ferchr. FaceTag: ${faceTag}`,
      url: `${APP_URL}/u/${params.faceTag}`,
      siteName: 'Ferchr',
      images: [
        {
          url: profileImage,
          width: 400,
          height: 400,
          alt: `${displayName}'s profile photo`,
        },
        {
          url: `${APP_URL}/api/og/profile?faceTag=${faceTag}&name=${encodeURIComponent(displayName)}`,
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
      description: `Connect with ${displayName}. FaceTag: ${faceTag}`,
      images: [`${APP_URL}/api/og/profile?faceTag=${faceTag}&name=${encodeURIComponent(displayName)}`],
    },
  };
}

export default async function ShareProfilePage({ params }: Props) {
  const faceTag = `@${params.faceTag}`;
  
  const supabase = await createClient();
  
  // Try to find attendee
  const { data: attendee } = await supabase
    .from('attendees')
    .select('id, display_name, profile_photo_url, face_tag')
    .eq('face_tag', faceTag)
    .single();

  if (!attendee) {
    // Redirect to main user profile page
    redirect(`/u/${params.faceTag}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4">
        <Logo variant="combo" size="sm" href="/" />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Profile Card */}
          <div className="bg-card rounded-3xl border border-border shadow-soft p-8 text-center">
            {/* Avatar */}
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden">
              {attendee.profile_photo_url ? (
                <img
                  src={attendee.profile_photo_url}
                  alt={attendee.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-accent" />
              )}
            </div>

            {/* Name */}
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {attendee.display_name}
            </h1>

            {/* FaceTag */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 rounded-full mb-6">
              <span className="text-accent font-mono font-semibold">
                {attendee.face_tag}
              </span>
            </div>

            {/* Description */}
            <p className="text-secondary mb-8">
              Connect with me on Ferchr to share and find event photos together.
            </p>

            {/* Actions */}
            <div className="space-y-3">
              <Button asChild size="lg" className="w-full">
                <Link href={`/u/${params.faceTag}`}>
                  View Full Profile
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>

              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href="/register">
                  Join Ferchr
                </Link>
              </Button>
            </div>
          </div>

          {/* QR Code hint */}
          <div className="mt-6 flex items-center justify-center gap-2 text-secondary text-sm">
            <QrCode className="w-4 h-4" />
            <span>Scan QR code to connect instantly</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Ferchr • Find yourself in every moment
        </p>
      </footer>
    </div>
  );
}
