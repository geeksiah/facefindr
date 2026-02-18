'use client';

import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Copy,
  Loader2,
  Share2,
  User,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';

type ProfileType = 'creator' | 'attendee';
type ShellType = 'dashboard' | 'gallery';

interface CreatorProfile {
  id: string;
  follow_target_id?: string;
  display_name: string;
  face_tag?: string;
  bio?: string;
  profile_photo_url?: string;
  public_profile_slug?: string;
  follower_count?: number;
  allow_follows?: boolean;
  eventCount?: number;
  events?: Array<{
    id: string;
    name: string;
    public_slug?: string;
    event_date?: string;
  }>;
}

interface AttendeeProfile {
  id: string;
  follow_target_id?: string;
  display_name: string;
  face_tag?: string;
  profile_photo_url?: string;
  public_profile_slug?: string;
  followers_count?: number;
  following_count?: number;
  allow_follows?: boolean;
}

interface ProfileShellViewProps {
  profileType: ProfileType;
  shell: ShellType;
  slug: string;
}

function formatDateLabel(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProfileShellView({ profileType, shell, slug }: ProfileShellViewProps) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [profile, setProfile] = useState<CreatorProfile | AttendeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const apiPath = useMemo(
    () =>
      profileType === 'creator'
        ? `/api/profiles/creator/${encodeURIComponent(slug)}`
        : `/api/profiles/user/${encodeURIComponent(slug)}`,
    [profileType, slug]
  );

  const publicPath = useMemo(() => {
    if (!profile) return '';
    const slugOrTag =
      profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id;
    return `${profileType === 'creator' ? '/c' : '/u'}/${slugOrTag}`;
  }, [profile, profileType]);
  const targetFollowId = useMemo(() => profile?.follow_target_id || profile?.id || '', [profile]);

  useEffect(() => {
    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    }

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiPath, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load profile');
        }
        if (!active) return;
        setProfile(data.profile || null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [apiPath]);

  useEffect(() => {
    if (!targetFollowId) return;
    const targetId = targetFollowId;
    let active = true;

    async function checkFollowStatus() {
      try {
        const res = await fetch(
          `/api/social/follow?type=check&targetType=${profileType === 'creator' ? 'creator' : 'attendee'}&targetId=${encodeURIComponent(targetId)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (active) setIsFollowing(Boolean(data.isFollowing));
      } catch {
        // ignore in anonymous/unauthorized contexts
      }
    }

    void checkFollowStatus();
    return () => {
      active = false;
    };
  }, [targetFollowId, profileType]);

  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    filter: `following_id=eq.${targetFollowId || '__none__'}`,
    onChange: () => {
      if (targetFollowId) {
        void refreshFollowState(targetFollowId);
      }
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected && targetFollowId) {
        void refreshFollowState(targetFollowId);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, targetFollowId, profileType]);

  async function refreshFollowState(targetId: string) {
    try {
      const checkRes = await fetch(
        `/api/social/follow?type=check&targetType=${profileType === 'creator' ? 'creator' : 'attendee'}&targetId=${encodeURIComponent(targetId)}`,
        { cache: 'no-store' }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        setIsFollowing(Boolean(checkData.isFollowing));
      }

      if (profileType === 'creator') {
        const followersRes = await fetch(`/api/profiles/creator/${encodeURIComponent(targetId)}/followers`, {
          cache: 'no-store',
        });
        if (followersRes.ok) {
          const followersData = await followersRes.json();
          const count = Number(followersData.count || 0);
          setProfile((prev) => (prev ? { ...prev, follower_count: count } : prev));
        }
      } else {
        const profileRes = await fetch(`/api/profiles/user/${encodeURIComponent(targetId)}`, {
          cache: 'no-store',
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          const count = Number(profileData?.profile?.followers_count || 0);
          setProfile((prev) => (prev ? { ...prev, followers_count: count } : prev));
        }
      }
    } catch {
      // ignore realtime refresh errors
    }
  }

  async function handleShare() {
    if (!profile || !publicPath || typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}${publicPath}`;
    const shareTitle = profile.display_name || 'Ferchr profile';

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // no-op
    }
  }

  async function handleFollowToggle() {
    if (!targetFollowId || followLoading) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (user.id === targetFollowId || user.id === profile?.id) {
      toast.info('Own profile', 'You cannot follow yourself.');
      return;
    }

    const allowsFollows =
      profileType === 'creator'
        ? (profile as CreatorProfile).allow_follows !== false
        : (profile as AttendeeProfile).allow_follows !== false;
    if (!allowsFollows) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        const searchParams = new URLSearchParams({
          targetType: profileType === 'creator' ? 'creator' : 'attendee',
          targetId: targetFollowId,
        });
        const res = await fetch(`/api/social/follow?${searchParams.toString()}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error('Unfollow failed', data?.error || 'Please try again.');
          return;
        }
        setIsFollowing(false);
        setProfile((prev) => {
          if (!prev) return prev;
          if (profileType === 'creator') {
            return {
              ...prev,
              follower_count: Math.max(0, ((prev as CreatorProfile).follower_count || 0) - 1),
            };
          }
          return {
            ...prev,
            followers_count: Math.max(0, ((prev as AttendeeProfile).followers_count || 0) - 1),
          };
        });
      } else {
        const payload =
          profileType === 'creator'
            ? { targetId: targetFollowId, targetType: 'creator' }
            : { targetId: targetFollowId, targetType: 'attendee' };
        const res = await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error('Follow failed', data?.error || 'Please try again.');
          return;
        }
        setIsFollowing(true);
        setProfile((prev) => {
          if (!prev) return prev;
          if (profileType === 'creator') {
            return {
              ...prev,
              follower_count: ((prev as CreatorProfile).follower_count || 0) + 1,
            };
          }
          return {
            ...prev,
            followers_count: ((prev as AttendeeProfile).followers_count || 0) + 1,
          };
        });
      }
    } finally {
      setFollowLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Profile unavailable</h1>
        <p className="mt-2 text-sm text-secondary">{error || 'Could not load this profile.'}</p>
      </div>
    );
  }

  const isCreator = profileType === 'creator';
  const creatorProfile = profile as CreatorProfile;
  const attendeeProfile = profile as AttendeeProfile;
  const followerCount = isCreator
    ? creatorProfile.follower_count || 0
    : attendeeProfile.followers_count || 0;
  const followersPath = isCreator
    ? `/p/${creatorProfile.public_profile_slug || creatorProfile.face_tag?.replace(/^@/, '') || creatorProfile.id}/followers`
    : `/u/${attendeeProfile.public_profile_slug || attendeeProfile.face_tag?.replace(/^@/, '') || attendeeProfile.id}/followers`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-secondary transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Button variant="outline" size="sm" onClick={handleShare}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
          {copied ? 'Copied' : 'Share'}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-semibold text-secondary">
            {profile.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt={profile.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              profile.display_name?.charAt(0)?.toUpperCase() || <User className="h-6 w-6" />
            )}
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{profile.display_name}</h1>
            {profile.face_tag && <p className="text-sm font-medium text-accent">{profile.face_tag}</p>}
            {isCreator && creatorProfile.bio && (
              <p className="mt-2 text-sm text-secondary">{creatorProfile.bio}</p>
            )}
          </div>

          {currentUserId !== targetFollowId &&
            ((isCreator && creatorProfile.allow_follows !== false) ||
              (!isCreator && attendeeProfile.allow_follows !== false)) && (
            <Button onClick={handleFollowToggle} disabled={followLoading}>
              {followLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isFollowing ? (
                <UserCheck className="mr-2 h-4 w-4" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href={followersPath} className="rounded-xl bg-muted/40 p-3 text-center hover:bg-muted/70 transition-colors">
            <p className="text-lg font-semibold text-foreground">{followerCount}</p>
            <p className="text-xs text-secondary">Followers</p>
          </Link>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <p className="text-lg font-semibold text-foreground">
              {isCreator ? creatorProfile.eventCount || 0 : attendeeProfile.following_count || 0}
            </p>
            <p className="text-xs text-secondary">{isCreator ? 'Events' : 'Following'}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{isCreator ? 'Creator' : 'Attendee'}</p>
            <p className="text-xs text-secondary">Account Type</p>
          </div>
        </div>
      </div>

      {isCreator && Array.isArray(creatorProfile.events) && creatorProfile.events.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Events</h2>
          <div className="space-y-3">
            {creatorProfile.events.slice(0, 6).map((event) => (
              <Link
                key={event.id}
                href={`/e/${event.public_slug || event.id}`}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div>
                  <p className="font-medium text-foreground">{event.name}</p>
                  {event.event_date && (
                    <p className="mt-1 text-xs text-secondary">{formatDateLabel(event.event_date)}</p>
                  )}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-secondary">
                  {shell === 'dashboard' ? <Camera className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
