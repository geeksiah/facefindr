'use client';

import {
  User,
  Share2,
  QrCode,
  Copy,
  Check,
  X,
  Download,
  Loader2,
  UserPlus,
  UserCheck,
  ExternalLink,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { QRCodeWithLogo, downloadQRCodeWithLogo } from '@/components/ui/qr-code-with-logo';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';

interface AttendeeProfile {
  id: string;
  display_name: string;
  face_tag: string;
  follow_target_id?: string;
  profile_photo_url?: string;
  followers_count?: number;
  following_count: number;
  allow_follows?: boolean;
  is_public_profile?: boolean;
  public_profile_slug?: string;
}

export default function AttendeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const slug = params?.slug as string;
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<AttendeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const followTargetId = profile?.follow_target_id || profile?.id;
  const qrCodeValue = typeof window !== 'undefined' ? `${window.location.href}?app=1` : '';
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const followSyncSeqRef = useRef(0);

  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    filter: `following_id=eq.${followTargetId || '__none__'}`,
    onChange: () => {
      if (followLoading) return;
      if (followTargetId) {
        void refreshFollowState(followTargetId);
      }
    },
  });

  useEffect(() => {
    void loadProfile();
  }, [slug]);

  useEffect(() => {
    if (followTargetId) {
      void refreshFollowState(followTargetId);
    }
  }, [followTargetId, slug]);

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
    const interval = setInterval(() => {
      if (!isConnected && !followLoading) {
        if (followTargetId) {
          void refreshFollowState(followTargetId);
        }
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, followTargetId, slug, followLoading]);

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
          ? `/gallery/people/attendee/${slugOrTag}`
          : `/dashboard/people/attendee/${slugOrTag}`;
      router.replace(shellPath);
    };

    void redirectToShellIfAuthenticated();
  }, [profile, searchParams, router]);

  async function loadProfile() {
    try {
      const res = await fetch(`/api/profiles/user/${slug}`, { cache: 'no-store' });
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

  async function refreshFollowState(targetId: string) {
    const seq = ++followSyncSeqRef.current;

    try {
      const [statusRes, profileRes] = await Promise.all([
        fetch(
          `/api/social/follow?type=check&targetType=attendee&targetId=${encodeURIComponent(targetId)}`,
          { cache: 'no-store' }
        ),
        fetch(`/api/profiles/user/${slug}`, { cache: 'no-store' }),
      ]);

      if (seq !== followSyncSeqRef.current) return;

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (seq === followSyncSeqRef.current) {
          setIsFollowing(Boolean(data.isFollowing));
        }
      }

      if (profileRes.ok) {
        const data = await profileRes.json();
        const nextCount = Number(data?.profile?.followers_count || 0);
        if (seq === followSyncSeqRef.current) {
          setProfile((prev) => (prev ? { ...prev, followers_count: nextCount } : prev));
        }
      }
    } catch {
      // ignore background refresh failures
    }
  }

  async function handleFollowToggle() {
    if (!profile?.id || followLoading) {
      return;
    }
    if (profile.allow_follows === false) {
      toast.info('Follows disabled', 'This user does not accept new followers.');
      return;
    }
    const followTargetId = profile.follow_target_id || profile.id;

    setFollowLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      if (user.id === followTargetId || user.id === profile.id) {
        toast.info('Own profile', 'You cannot follow yourself.');
        return;
      }

      if (isFollowing) {
        const res = await fetch(
          `/api/social/follow?targetType=attendee&targetId=${encodeURIComponent(followTargetId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error('Unfollow failed', data?.error || 'Please try again.');
          return;
        }
        const data = await res.json().catch(() => ({}));
        setIsFollowing(false);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                followers_count:
                  typeof data?.followersCount === 'number'
                    ? data.followersCount
                    : Math.max(0, prev.followers_count || 0),
              }
            : prev
        );
        toast.success('Unfollowed', `You are no longer following ${profile.display_name}.`);
      } else {
        const res = await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: followTargetId, targetType: 'attendee' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error('Follow failed', data?.error || 'Please try again.');
          return;
        }
        const data = await res.json().catch(() => ({}));
        setIsFollowing(true);
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                followers_count:
                  typeof data?.followersCount === 'number'
                    ? data.followersCount
                    : (prev.followers_count || 0) + 1,
              }
            : prev
        );
        toast.success('Following', `You are now following ${profile.display_name}.`);
      }
    } finally {
      if (followTargetId) {
        await refreshFollowState(followTargetId);
      }
      setFollowLoading(false);
    }
  }

  async function handleCopyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const input = document.createElement('textarea');
        input.value = window.location.href;
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
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: profile?.display_name || 'Ferchr Profile',
          url: window.location.href,
        });
      } else {
        await handleCopyLink();
      }
    } catch (error) {
      console.error('Share failed:', error);
    } finally {
      setShowShareMenu(false);
    }
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
            <div className="relative">
              <button
                onClick={() => setShowShareMenu((prev) => !prev)}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-5 w-5 text-success" /> : <Share2 className="h-5 w-5 text-foreground" />}
              </button>
              {showShareMenu && (
                <>
                  <button
                    onClick={() => setShowShareMenu(false)}
                    className="fixed inset-0 z-40"
                    aria-label="Close share menu"
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border bg-card p-2 shadow-lg">
                    <button
                      onClick={() => {
                        void handleCopyLink();
                        setShowShareMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Link
                    </button>
                    <button
                      onClick={() => void handleShare()}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </>
              )}
            </div>
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
            {currentUserId && followTargetId && currentUserId === followTargetId ? (
              <Link
                href={`/u/${profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id}/followers`}
                className="text-center hover:opacity-80 transition-opacity"
              >
                <p className="font-bold text-foreground">{profile.followers_count || 0}</p>
                <p className="text-secondary">Followers</p>
              </Link>
            ) : (
              <div className="text-center">
                <p className="font-bold text-foreground">{profile.followers_count || 0}</p>
                <p className="text-secondary">Followers</p>
              </div>
            )}
            <div className="text-center">
              <p className="font-bold text-foreground">{profile.following_count}</p>
              <p className="text-secondary">Following</p>
            </div>
          </div>

          {profile.allow_follows !== false &&
            currentUserId !== (profile.follow_target_id || profile.id) && (
            <div className="mt-6">
              <Button onClick={handleFollowToggle} disabled={followLoading}>
                {followLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : isFollowing ? (
                  <UserCheck className="h-4 w-4 mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
            </div>
          )}

          {/* Add Connection CTA (for photographers viewing) */}
          <div className="mt-8 p-6 bg-muted rounded-2xl max-w-md mx-auto">
            <p className="text-secondary text-sm">
              This is a Ferchr user profile. Creators can add this user as a connection to easily tag them in photos.
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
              Scan to view this profile in the Ferchr app
            </p>
            
            <button
              onClick={async () => {
                if (!qrCodeRef.current || downloadingQr) return;
                setDownloadingQr(true);
                if (qrCodeRef.current) {
                  try {
                    await downloadQRCodeWithLogo(qrCodeRef.current, `${profile.display_name}-qr-code.png`);
                  } finally {
                    setDownloadingQr(false);
                  }
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


