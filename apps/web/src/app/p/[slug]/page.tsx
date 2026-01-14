'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Camera,
  Calendar,
  MapPin,
  Users,
  Globe,
  Instagram,
  Twitter,
  Facebook,
  Share2,
  QrCode,
  Check,
  Copy,
  ExternalLink,
  ChevronRight,
  UserPlus,
  UserCheck,
  X,
  Download,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

interface PhotographerProfile {
  id: string;
  display_name: string;
  face_tag: string;
  bio?: string;
  profile_photo_url?: string;
  website_url?: string;
  instagram_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  follower_count: number;
  public_profile_slug?: string;
  events: Array<{
    id: string;
    name: string;
    cover_image_url?: string;
    event_date: string;
    location?: string;
    public_slug?: string;
  }>;
  eventCount: number;
}

export default function PhotographerProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const openInApp = searchParams.get('app') === '1';

  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadProfile();
    checkFollowStatus();
    
    // Attempt deep link if app=1
    if (openInApp && profile?.id) {
      attemptDeepLink();
    }
  }, [slug]);

  async function loadProfile() {
    try {
      const res = await fetch(`/api/profiles/photographer/${slug}`);
      const data = await res.json();

      if (res.ok) {
        setProfile(data.profile);
        // Track view
        fetch('/api/profiles/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: data.profile.id, profileType: 'photographer' }),
        }).catch(() => {});
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function checkFollowStatus() {
    try {
      const res = await fetch(`/api/social/follow?type=check&photographerId=${slug}`);
      const data = await res.json();
      setIsFollowing(data.isFollowing);
    } catch {
      // Ignore - user might not be logged in
    }
  }

  function attemptDeepLink() {
    if (!profile) return;
    
    const appUrl = `facefindr://photographer/${profile.id}`;
    const timeout = setTimeout(() => {
      // App not installed or didn't open - stay on web
    }, 2000);

    window.location.href = appUrl;
    
    // Clear timeout if page is hidden (app opened)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(timeout);
      }
    }, { once: true });
  }

  async function handleFollow() {
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await fetch(`/api/social/follow?photographerId=${profile?.id}`, { method: 'DELETE' });
        setIsFollowing(false);
      } else {
        await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photographerId: profile?.id }),
        });
        setIsFollowing(true);
      }
    } catch {
      // Handle error
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleShare(platform: string) {
    const url = window.location.href;
    const text = `Check out ${profile?.display_name} on FaceFindr`;

    switch (platform) {
      case 'copy':
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`);
        break;
    }
    setShowShareMenu(false);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
          <Camera className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Profile Not Found</h1>
          <p className="text-secondary mb-6">{error || 'This profile does not exist or is private.'}</p>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(window.location.href + '?app=1')}&size=512x512&margin=2`;

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
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <Share2 className="h-5 w-5 text-foreground" />
              </button>
              
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card shadow-lg z-50 p-2">
                    <button
                      onClick={() => handleShare('copy')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button
                      onClick={() => handleShare('twitter')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground"
                    >
                      <Twitter className="h-4 w-4" />
                      Twitter
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground"
                    >
                      <Facebook className="h-4 w-4" />
                      Facebook
                    </button>
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      WhatsApp
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Profile */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
          {/* Avatar */}
          <div className="relative">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-muted border-4 border-card shadow-lg">
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
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-accent rounded-full flex items-center justify-center">
              <Camera className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
            <p className="text-accent font-medium">{profile.face_tag}</p>
            
            {profile.bio && (
              <p className="text-secondary mt-2 max-w-md">{profile.bio}</p>
            )}

            {/* Stats */}
            <div className="flex items-center justify-center sm:justify-start gap-6 mt-4 text-sm">
              <div className="text-center">
                <p className="font-bold text-foreground">{profile.follower_count}</p>
                <p className="text-secondary">Followers</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-foreground">{profile.eventCount}</p>
                <p className="text-secondary">Events</p>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
              {profile.website_url && (
                <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
                  <Globe className="h-5 w-5 text-foreground" />
                </a>
              )}
              {profile.instagram_url && (
                <a href={profile.instagram_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
                  <Instagram className="h-5 w-5 text-foreground" />
                </a>
              )}
              {profile.twitter_url && (
                <a href={profile.twitter_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
                  <Twitter className="h-5 w-5 text-foreground" />
                </a>
              )}
              {profile.facebook_url && (
                <a href={profile.facebook_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
                  <Facebook className="h-5 w-5 text-foreground" />
                </a>
              )}
            </div>

            {/* Follow Button */}
            <div className="mt-6">
              <Button
                onClick={handleFollow}
                disabled={followLoading}
                variant={isFollowing ? 'outline' : 'default'}
                className="min-w-[140px]"
              >
                {followLoading ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isFollowing ? (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Follow
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Events */}
        {profile.events.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Events</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profile.events.map((event) => (
                <Link
                  key={event.id}
                  href={`/e/${event.public_slug || event.id}`}
                  className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-accent transition-colors"
                >
                  <div className="relative aspect-video bg-muted">
                    {event.cover_image_url ? (
                      <Image
                        src={event.cover_image_url}
                        alt={event.name}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
                      {event.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-secondary">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(event.event_date)}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1 truncate">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {profile.eventCount > profile.events.length && (
              <div className="text-center mt-6">
                <Button variant="outline">
                  View All {profile.eventCount} Events
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </section>
        )}

        {profile.events.length === 0 && (
          <div className="text-center py-12 bg-muted rounded-2xl">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-secondary">No public events yet</p>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {showQRCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowQRCode(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border p-6 max-w-sm w-full m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Scan to Follow</h3>
              <button onClick={() => setShowQRCode(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="bg-white p-4 rounded-xl mb-4">
              <img src={qrCodeUrl} alt="Profile QR Code" className="w-full" />
            </div>
            
            <p className="text-sm text-secondary text-center mb-4">
              Scan this QR code to view {profile.display_name}'s profile in the FaceFindr app
            </p>
            
            <a
              href={qrCodeUrl.replace('size=512x512', 'size=1024x1024') + '&download=1'}
              download={`${profile.display_name}-qr-code.png`}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-muted rounded-xl text-foreground hover:bg-muted/70 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download QR Code
            </a>
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
