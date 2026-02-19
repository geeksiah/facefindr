'use client';

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
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect , useRef } from 'react';


import { RatingsDisplay } from '@/components/photographer/ratings-display';
import { TipCreator } from '@/components/social/tip-photographer';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { QRCodeWithLogo, downloadQRCodeWithLogo } from '@/components/ui/qr-code-with-logo';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';


interface CreatorProfile {
  id: string;
  follow_target_id?: string;
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
    event_start_at_utc?: string | null;
    event_timezone?: string;
    location?: string;
    public_slug?: string;
  }>;
  eventCount: number;
}

export default function CreatorProfilePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const openInApp = searchParams?.get('app') === '1';

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const followTargetId = profile?.follow_target_id || profile?.id;
  const followSyncSeqRef = useRef(0);

  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    filter: `following_id=eq.${followTargetId || '__none__'}`,
    onChange: () => {
      if (!followLoading && followTargetId) {
        void refreshFollowState(followTargetId);
      }
    },
  });

  useEffect(() => {
    loadProfile();
    
    // Attempt deep link if app=1
    if (openInApp && profile?.id) {
      attemptDeepLink();
    }
  }, [slug]);

  useEffect(() => {
    if (followTargetId) {
      void refreshFollowState(followTargetId);
    }
  }, [followTargetId, slug]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected && !followLoading && followTargetId) {
        void refreshFollowState(followTargetId);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, followLoading, followTargetId, slug]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    void loadCurrentUser();
  }, []);

  useEffect(() => {
    const redirectToShellIfAuthenticated = async () => {
      if (!profile) return;
      if (searchParams?.get('public') === '1') return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const userType = user.user_metadata?.user_type;
      const slugOrTag =
        profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id;
      const shellPath =
        userType === 'attendee'
          ? `/gallery/people/creator/${slugOrTag}`
          : `/dashboard/people/creator/${slugOrTag}`;
      router.replace(shellPath);
    };

    void redirectToShellIfAuthenticated();
  }, [profile, searchParams, router]);

  async function loadProfile() {
    try {
      const res = await fetch(`/api/profiles/creator/${slug}`);
      const data = await res.json();

      if (res.ok) {
        setProfile(data.profile);
        // Track view
        fetch('/api/profiles/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: data.profile.id, profileType: 'creator' }),
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

  async function refreshFollowState(targetId: string) {
    const seq = ++followSyncSeqRef.current;

    try {
      const [statusRes, profileRes] = await Promise.all([
        fetch(
          `/api/social/follow?type=check&targetType=creator&targetId=${encodeURIComponent(targetId)}`,
          { cache: 'no-store' }
        ),
        fetch(`/api/profiles/creator/${slug}`, { cache: 'no-store' }),
      ]);

      if (seq !== followSyncSeqRef.current) return;

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (seq === followSyncSeqRef.current) {
          setIsFollowing(Boolean(statusData.isFollowing));
        }
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const nextCount = Number(profileData?.profile?.follower_count || 0);
        if (seq === followSyncSeqRef.current) {
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  follower_count: nextCount,
                }
              : prev
          );
        }
      }
    } catch {
      // Ignore background sync errors.
    }
  }

  function attemptDeepLink() {
    if (!profile) return;
    
    const appUrl = `ferchr://creator/${profile.id}`;
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const targetId = profile?.follow_target_id || profile?.id;
    if (!targetId) {
      toast.error('Follow failed', 'Creator not found.');
      return;
    }

    if (user.id === targetId || user.id === profile?.id) {
      toast.info('Own profile', 'You cannot follow yourself.');
      return;
    }

    setFollowLoading(true);
    try {
      if (isFollowing) {
        const response = await fetch(
          `/api/social/follow?targetType=creator&targetId=${encodeURIComponent(targetId)}`,
          { method: 'DELETE' }
        );
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          setIsFollowing(false);
          if (profile) {
            const nextCount =
              typeof payload?.followersCount === 'number'
                ? payload.followersCount
                : Math.max(0, profile.follower_count || 0);
            setProfile((prev) => (prev ? { ...prev, follower_count: nextCount } : prev));
          }
          toast.success('Unfollowed', `You unfollowed ${profile?.display_name || 'this creator'}.`);
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error('Unfollow failed', data?.error || 'Please try again.');
        }
      } else {
        const response = await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType: 'creator', targetId }),
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          setIsFollowing(true);
          if (profile) {
            const nextCount =
              typeof payload?.followersCount === 'number'
                ? payload.followersCount
                : (profile.follower_count || 0) + 1;
            setProfile((prev) => (prev ? { ...prev, follower_count: nextCount } : prev));
          }
          toast.success('Following', `You are now following ${profile?.display_name || 'this creator'}.`);
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error('Follow failed', data?.error || 'Please try again.');
        }
      }
    } catch (error) {
      console.error('Follow error:', error);
      toast.error('Follow failed', 'Please try again.');
    } finally {
      if (targetId) {
        await refreshFollowState(targetId);
      }
      setFollowLoading(false);
    }
  }

  async function handleShare(platform: string) {
    const url = window.location.href;
    const text = `Check out ${profile?.display_name} on Ferchr`;

    switch (platform) {
      case 'copy':
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
          } else {
            const input = document.createElement('textarea');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            input.remove();
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (error) {
          console.error('Copy profile link failed:', error);
        }
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

  function formatDate(eventData: CreatorProfile['events'][number]) {
    return formatEventDateDisplay(
      {
        event_date: eventData.event_date,
        event_start_at_utc: eventData.event_start_at_utc || null,
        event_timezone: eventData.event_timezone || 'UTC',
      },
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' }
    );
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

  // QR code value for profile sharing
  const qrCodeValue = typeof window !== 'undefined' ? `${window.location.href}?app=1` : '';

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
              {currentUserId && followTargetId && currentUserId === followTargetId ? (
                <Link
                  href={`/p/${profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id}/followers`}
                  className="text-center hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <p className="font-bold text-foreground">{profile.follower_count || 0}</p>
                  <p className="text-secondary">Followers</p>
                </Link>
              ) : (
                <div className="text-center">
                  <p className="font-bold text-foreground">{profile.follower_count || 0}</p>
                  <p className="text-secondary">Followers</p>
                </div>
              )}
              <div className="text-center">
                <p className="font-bold text-foreground">{profile.eventCount}</p>
                <p className="text-secondary">Events</p>
              </div>
              <div className="text-center">
                <RatingsDisplay photographerId={profile.id} showRatingButton={true} variant="compact" />
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
              <div className="flex flex-wrap items-center gap-3">
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
                <Button variant="outline" onClick={() => setShowTipModal(true)}>
                  Tip Creator
                </Button>
              </div>
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
                        {formatDate(event)}
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
              <h3 className="font-semibold text-foreground">Scan to Follow</h3>
              <button onClick={() => setShowQRCode(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div 
              ref={qrCodeRef}
              className="bg-white p-4 rounded-xl mb-4 flex items-center justify-center"
              data-qr-container
            >
              <QRCodeWithLogo
                value={typeof window !== 'undefined' ? `${window.location.href}?app=1` : ''}
                size={256}
                className="mx-auto"
              />
            </div>
            
            <p className="text-sm text-secondary text-center mb-4">
              Scan this QR code to view {profile.display_name}'s profile in the Ferchr app
            </p>
            
            <button
              onClick={async () => {
                if (!qrCodeRef.current || downloadingQr) return;
                setDownloadingQr(true);
                try {
                  await downloadQRCodeWithLogo(
                    qrCodeRef.current,
                    `${profile.display_name}-qr-code`,
                    'png'
                  );
                } catch (error) {
                  console.error('Download error:', error);
                } finally {
                  setDownloadingQr(false);
                }
              }}
              disabled={downloadingQr}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-muted rounded-xl text-foreground hover:bg-muted/70 transition-colors"
            >
              {downloadingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloadingQr ? 'Downloading...' : 'Download QR Code'}
            </button>
          </div>
        </div>
      )}

      {showTipModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowTipModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <TipCreator
              photographerId={profile.id}
              photographerName={profile.display_name}
              onCancel={() => setShowTipModal(false)}
            />
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



