'use client';

import {
  User,
  Share2,
  QrCode,
  Copy,
  Check,
  X,
  Download,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { QRCodeWithLogo, downloadQRCodeWithLogo } from '@/components/ui/qr-code-with-logo';

interface AttendeeProfile {
  id: string;
  display_name: string;
  face_tag: string;
  profile_photo_url?: string;
  following_count: number;
  public_profile_slug?: string;
}

export default function AttendeeProfilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [profile, setProfile] = useState<AttendeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrCodeValue = typeof window !== 'undefined' ? `${window.location.href}?app=1` : '';
  const qrCodeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadProfile();
  }, [slug]);

  async function loadProfile() {
    try {
      const res = await fetch(`/api/profiles/user/${slug}`);
      const data = await res.json();

      if (res.ok) {
        setProfile(data.profile);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Profile Not Found</h1>
          <p className="text-secondary mb-6">{error || 'This profile does not exist or is private.'}</p>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <Logo variant="combo" className="h-8" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQRCode(true)}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <QrCode className="h-5 w-5 text-foreground" />
            </button>
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
            >
              {copied ? <Check className="h-5 w-5 text-success" /> : <Share2 className="h-5 w-5 text-foreground" />}
            </button>
          </div>
        </div>
      </header>

      {/* Profile */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="text-center">
          {/* Avatar */}
          <div className="relative inline-block mb-6">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-muted border-4 border-card shadow-lg mx-auto">
              {profile.profile_photo_url ? (
                <Image
                  src={profile.profile_photo_url}
                  alt={profile.display_name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-secondary">
                  {profile.display_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
          <p className="text-accent font-medium mt-1">{profile.face_tag}</p>

          {/* Stats */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm">
            <div className="text-center">
              <p className="font-bold text-foreground">{profile.following_count}</p>
              <p className="text-secondary">Following</p>
            </div>
          </div>

          {/* Add Connection CTA (for photographers viewing) */}
          <div className="mt-8 p-6 bg-muted rounded-2xl max-w-md mx-auto">
            <p className="text-secondary text-sm">
              This is a FaceFindr user profile. Photographers can add this user as a connection to easily tag them in photos.
            </p>
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {showQRCode && (
        <div
          className="fixed z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
          onClick={() => setShowQRCode(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border p-6 max-w-sm w-full m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Profile QR Code</h3>
              <button onClick={() => setShowQRCode(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-xl mb-4 flex items-center justify-center">
              <QRCodeWithLogo ref={qrCodeRef} value={qrCodeValue} size={220} />
            </div>
            
            <p className="text-sm text-secondary text-center mb-4">
              Scan to view this profile in the FaceFindr app
            </p>
            
            <button
              onClick={async () => {
                if (qrCodeRef.current) {
                  await downloadQRCodeWithLogo(qrCodeRef.current, `${profile.display_name}-qr-code.png`);
                }
              }}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-muted rounded-xl text-foreground hover:bg-muted/70 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download QR Code
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Link href="/" className="inline-block">
            <Logo variant="combo" className="h-6 opacity-60 hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      </footer>
    </div>
  );
}

