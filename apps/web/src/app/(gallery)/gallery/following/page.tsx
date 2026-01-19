'use client';

/**
 * Following Page (Attendee)
 * 
 * Shows list of photographers the attendee is following with notification preferences.
 */

import {
  ArrowLeft,
  Camera,
  UserMinus,
  Bell,
  BellOff,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { useToast } from '@/components/ui/toast';

interface FollowingItem {
  id: string;
  following_id: string;
  notify_new_event: boolean;
  notify_photo_drop: boolean;
  created_at: string;
  photographers: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    bio: string | null;
    public_profile_slug: string | null;
  };
}

export default function FollowingPage() {
  const router = useRouter();
  const toast = useToast();
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFollowing = useCallback(async () => {
    try {
      const response = await fetch('/api/social/follow?type=following');
      if (response.ok) {
        const data = await response.json();
        setFollowing(data.following || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error loading following:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFollowing();
  }, [loadFollowing]);

  // Subscribe to realtime updates
  useRealtimeSubscription({
    table: 'follows',
    onChange: () => loadFollowing(),
  });

  const handleUnfollow = async (photographerId: string, name: string) => {
    if (!confirm(`Are you sure you want to unfollow ${name}?`)) return;

    try {
      const response = await fetch(`/api/social/follow?photographerId=${photographerId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFollowing((prev) => prev.filter((f) => f.following_id !== photographerId));
        setTotal((prev) => prev - 1);
        toast.success('Unfollowed', `You are no longer following ${name}`);
      }
    } catch (error) {
      console.error('Unfollow error:', error);
      toast.error('Error', 'Failed to unfollow. Please try again.');
    }
  };

  const toggleNotification = async (
    followId: string,
    photographerId: string,
    field: 'notify_new_event' | 'notify_photo_drop'
  ) => {
    const item = following.find((f) => f.id === followId);
    if (!item) return;

    const newValue = !item[field];

    // Optimistic update
    setFollowing((prev) =>
      prev.map((f) => (f.id === followId ? { ...f, [field]: newValue } : f))
    );

    try {
      await fetch('/api/social/follow/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photographerId,
          [field === 'notify_new_event' ? 'notifyNewEvent' : 'notifyPhotoDrop']: newValue,
        }),
      });
    } catch (error) {
      // Revert on error
      setFollowing((prev) =>
        prev.map((f) => (f.id === followId ? { ...f, [field]: !newValue } : f))
      );
      console.error('Toggle notifications error:', error);
    }
  };

  const filteredFollowing = following.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.photographers.display_name.toLowerCase().includes(query) ||
      item.photographers.face_tag?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Following</h1>
          <p className="text-secondary">
            {total} photographer{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      {following.length > 5 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search photographers..."
            className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      )}

      {/* Following List */}
      {filteredFollowing.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">
            {searchQuery ? 'No results found' : 'Not following anyone'}
          </h3>
          <p className="text-sm text-secondary mb-6">
            {searchQuery
              ? 'Try a different search term'
              : 'Follow photographers to get updates about their events and new photos'}
          </p>
          {!searchQuery && (
            <Button asChild>
              <Link href="/gallery/events">Find Photographers</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFollowing.map((item) => {
            const photographer = item.photographers;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Photographer Info */}
                <Link
                  href={`/p/${photographer.public_profile_slug || photographer.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {photographer.profile_photo_url ? (
                    <Image
                      src={photographer.profile_photo_url}
                      alt={photographer.display_name}
                      width={52}
                      height={52}
                      className="h-13 w-13 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-13 w-13 items-center justify-center rounded-full bg-muted">
                      <Camera className="h-6 w-6 text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {photographer.display_name}
                    </p>
                    <p className="text-sm text-accent font-mono truncate">
                      {photographer.face_tag}
                    </p>
                    {photographer.bio && (
                      <p className="text-sm text-secondary truncate mt-1">
                        {photographer.bio}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-secondary flex-shrink-0" />
                </Link>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-border p-3 bg-muted/30">
                  <button
                    onClick={() =>
                      toggleNotification(item.id, item.following_id, 'notify_new_event')
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                      item.notify_new_event
                        ? 'bg-accent/10 text-accent'
                        : 'bg-muted text-secondary hover:text-foreground'
                    }`}
                  >
                    {item.notify_new_event ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <BellOff className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">Events</span>
                  </button>

                  <button
                    onClick={() =>
                      toggleNotification(item.id, item.following_id, 'notify_photo_drop')
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                      item.notify_photo_drop
                        ? 'bg-accent/10 text-accent'
                        : 'bg-muted text-secondary hover:text-foreground'
                    }`}
                  >
                    {item.notify_photo_drop ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <BellOff className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">Photos</span>
                  </button>

                  <button
                    onClick={() => handleUnfollow(item.following_id, photographer.display_name)}
                    className="flex items-center justify-center h-9 w-9 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    title="Unfollow"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
