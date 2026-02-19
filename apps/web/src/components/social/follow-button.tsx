'use client';

import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  photographerId: string;
  photographerName?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
  className?: string;
}

export function FollowButton({
  photographerId,
  photographerName,
  variant = 'default',
  size = 'md',
  showCount = false,
  onFollowChange,
  className,
}: FollowButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const buttonSize = size === 'md' ? 'default' : size;
  const supabase = createClient();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const followSyncSeqRef = useRef(0);

  useEffect(() => {
    void refreshFollowState();
  }, [photographerId]);

  // Subscribe to real-time follow updates
  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    filter: `following_id=eq.${photographerId}`,
    onChange: () => {
      if (isToggling) return;
      void refreshFollowState();
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected && !isToggling) {
        void refreshFollowState();
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, photographerId, showCount, isToggling]);

  const refreshFollowState = async () => {
    const seq = ++followSyncSeqRef.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (seq === followSyncSeqRef.current) {
          setIsFollowing(false);
          if (showCount) setFollowerCount(0);
        }
        return;
      }

      const [statusResponse, countResponse] = await Promise.all([
        fetch(
          `/api/social/follow?type=check&targetType=creator&targetId=${encodeURIComponent(photographerId)}`,
          { cache: 'no-store' }
        ),
        showCount
          ? fetch(`/api/profiles/creator/${encodeURIComponent(photographerId)}/followers`, {
              cache: 'no-store',
            })
          : Promise.resolve(null),
      ]);

      if (seq !== followSyncSeqRef.current) {
        return;
      }

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (seq === followSyncSeqRef.current) {
          setIsFollowing(Boolean(statusData?.isFollowing));
        }
      }

      if (countResponse && countResponse.ok) {
        const countData = await countResponse.json();
        if (seq === followSyncSeqRef.current) {
          setFollowerCount(Number(countData?.count || 0));
        }
      }
    } finally {
      if (seq === followSyncSeqRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleToggleFollow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to login or show auth prompt
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setIsToggling(true);
    try {
      if (isFollowing) {
        // Unfollow
        const response = await fetch(
          `/api/social/follow?targetType=creator&targetId=${encodeURIComponent(photographerId)}`,
          {
          method: 'DELETE',
          }
        );

        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          setIsFollowing(false);
          if (showCount) {
            if (typeof payload?.followersCount === 'number') {
              setFollowerCount(payload.followersCount);
            } else if (followerCount !== null) {
              setFollowerCount(Math.max(0, followerCount - 1));
            }
          }
          onFollowChange?.(false);
          toast.success('Unfollowed', photographerName ? `You unfollowed ${photographerName}.` : 'Unfollowed successfully.');
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error('Unfollow failed', data?.error || 'Please try again.');
        }
      } else {
        // Follow
        const response = await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType: 'creator', targetId: photographerId }),
        });

        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          setIsFollowing(true);
          if (showCount) {
            if (typeof payload?.followersCount === 'number') {
              setFollowerCount(payload.followersCount);
            } else if (followerCount !== null) {
              setFollowerCount(followerCount + 1);
            }
          }
          onFollowChange?.(true);
          toast.success('Following', photographerName ? `You are now following ${photographerName}.` : 'Followed successfully.');
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error('Follow failed', data?.error || 'Please try again.');
        }
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
    } finally {
      void refreshFollowState();
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (
      <Button
        variant={variant}
        size={buttonSize}
        disabled
        className={className}
      >
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        onClick={handleToggleFollow}
        disabled={isToggling}
        variant={isFollowing ? 'outline' : variant}
        size={buttonSize}
      >
        {isToggling ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : isFollowing ? (
          <UserCheck className="h-4 w-4 mr-2" />
        ) : (
          <UserPlus className="h-4 w-4 mr-2" />
        )}
        {isFollowing ? 'Following' : 'Follow'}
      </Button>
      {showCount && followerCount !== null && (
        <span className="text-sm text-secondary">
          {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
        </span>
      )}
    </div>
  );
}
