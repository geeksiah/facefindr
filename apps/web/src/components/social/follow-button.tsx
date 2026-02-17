'use client';

import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
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
  const buttonSize = size === 'md' ? 'default' : size;
  const supabase = createClient();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);

  useEffect(() => {
    checkFollowStatus();
    if (showCount) {
      loadFollowerCount();
    }
  }, [photographerId]);

  // Subscribe to real-time follow updates
  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    filter: `following_id=eq.${photographerId}`,
    onChange: () => {
      checkFollowStatus();
      if (showCount) {
        loadFollowerCount();
      }
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        void checkFollowStatus();
        if (showCount) {
          void loadFollowerCount();
        }
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, photographerId, showCount]);

  const checkFollowStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsFollowing(false);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/social/follow?type=check&photographerId=${photographerId}`);
      if (response.ok) {
        const data = await response.json();
        setIsFollowing(data.isFollowing);
      }
    } catch (error) {
      console.error('Failed to check follow status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFollowerCount = async () => {
    try {
      const response = await fetch(`/api/profiles/creator/${photographerId}/followers`);
      if (response.ok) {
        const data = await response.json();
        setFollowerCount(data.count || 0);
      }
    } catch (error) {
      console.error('Failed to load follower count:', error);
    }
  };

  const handleToggleFollow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to login or show auth prompt
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }

    setIsToggling(true);
    try {
      if (isFollowing) {
        // Unfollow
        const response = await fetch(`/api/social/follow?photographerId=${photographerId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          setIsFollowing(false);
          if (showCount && followerCount !== null) {
            setFollowerCount(Math.max(0, followerCount - 1));
          }
          onFollowChange?.(false);
        }
      } else {
        // Follow
        const response = await fetch('/api/social/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photographerId }),
        });

        if (response.ok) {
          setIsFollowing(true);
          if (showCount && followerCount !== null) {
            setFollowerCount(followerCount + 1);
          }
          onFollowChange?.(true);
        }
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
    } finally {
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
