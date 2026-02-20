'use client';

import {
  ArrowLeft,
  Bell,
  BellOff,
  Camera,
  ChevronRight,
  Loader2,
  Search,
  User,
  UserMinus,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { useToast } from '@/components/ui/toast';

interface FollowingCreatorItem {
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

interface FollowingUserItem {
  id: string;
  following_id: string;
  created_at: string;
  attendees: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    public_profile_slug?: string | null;
  };
}

export default function FollowingPage() {
  const router = useRouter();
  const toast = useToast();
  const [creatorFollowing, setCreatorFollowing] = useState<FollowingCreatorItem[]>([]);
  const [attendeeFollowing, setAttendeeFollowing] = useState<FollowingUserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFollowing = useCallback(async () => {
    try {
      const response = await fetch('/api/social/follow?type=following&includeAttendees=true', {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        setCreatorFollowing(data.following || []);
        setAttendeeFollowing(data.followingUsers || []);
        setTotal(data.total || 0);
      } else {
        setCreatorFollowing([]);
        setAttendeeFollowing([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('Error loading following:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFollowing();
  }, [loadFollowing]);

  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    onChange: () => {
      void loadFollowing();
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        void loadFollowing();
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [isConnected, loadFollowing]);

  const handleUnfollowCreator = async (creatorId: string, name: string) => {
    if (!confirm(`Are you sure you want to unfollow ${name}?`)) return;

    try {
      const response = await fetch(`/api/social/follow?photographerId=${creatorId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setCreatorFollowing((prev) => prev.filter((item) => item.following_id !== creatorId));
        setTotal((prev) => Math.max(0, prev - 1));
        toast.success('Unfollowed', `You are no longer following ${name}`);
      }
    } catch (error) {
      console.error('Unfollow creator error:', error);
      toast.error('Error', 'Failed to unfollow. Please try again.');
    }
  };

  const handleUnfollowAttendee = async (attendeeId: string, name: string) => {
    if (!confirm(`Are you sure you want to unfollow ${name}?`)) return;

    try {
      const response = await fetch(
        `/api/social/follow?targetType=attendee&targetId=${encodeURIComponent(attendeeId)}`,
        { method: 'DELETE' }
      );
      if (response.ok) {
        setAttendeeFollowing((prev) => prev.filter((item) => item.following_id !== attendeeId));
        setTotal((prev) => Math.max(0, prev - 1));
        toast.success('Unfollowed', `You are no longer following ${name}`);
      }
    } catch (error) {
      console.error('Unfollow attendee error:', error);
      toast.error('Error', 'Failed to unfollow. Please try again.');
    }
  };

  const toggleNotification = async (
    followId: string,
    creatorId: string,
    field: 'notify_new_event' | 'notify_photo_drop'
  ) => {
    const item = creatorFollowing.find((f) => f.id === followId);
    if (!item) return;

    const nextValue = !item[field];
    setCreatorFollowing((prev) =>
      prev.map((f) => (f.id === followId ? { ...f, [field]: nextValue } : f))
    );

    try {
      await fetch('/api/social/follow/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photographerId: creatorId,
          [field === 'notify_new_event' ? 'notifyNewEvent' : 'notifyPhotoDrop']: nextValue,
        }),
      });
    } catch (error) {
      setCreatorFollowing((prev) =>
        prev.map((f) => (f.id === followId ? { ...f, [field]: !nextValue } : f))
      );
      console.error('Toggle notifications error:', error);
    }
  };

  const filteredCreatorFollowing = useMemo(() => {
    if (!searchQuery.trim()) return creatorFollowing;
    const q = searchQuery.trim().toLowerCase();
    return creatorFollowing.filter((item) => {
      return (
        item.photographers.display_name.toLowerCase().includes(q) ||
        item.photographers.face_tag?.toLowerCase().includes(q)
      );
    });
  }, [creatorFollowing, searchQuery]);

  const filteredAttendeeFollowing = useMemo(() => {
    if (!searchQuery.trim()) return attendeeFollowing;
    const q = searchQuery.trim().toLowerCase();
    return attendeeFollowing.filter((item) => {
      return (
        item.attendees.display_name.toLowerCase().includes(q) ||
        item.attendees.face_tag?.toLowerCase().includes(q)
      );
    });
  }, [attendeeFollowing, searchQuery]);

  const hasAnyFollowing = filteredCreatorFollowing.length > 0 || filteredAttendeeFollowing.length > 0;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
            {total} account{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {(creatorFollowing.length + attendeeFollowing.length) > 5 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search following..."
            className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      )}

      {!hasAnyFollowing ? (
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
              : 'Follow creators and attendees to stay updated.'}
          </p>
          {!searchQuery && (
            <Button asChild>
              <Link href="/gallery/events">Find People</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCreatorFollowing.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-secondary">Creators</h2>
              {filteredCreatorFollowing.map((item) => {
                const creator = item.photographers;
                return (
                  <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <Link
                      href={`/gallery/people/creator/${creator.public_profile_slug || creator.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                    >
                      {creator.profile_photo_url ? (
                        <Image
                          src={creator.profile_photo_url}
                          alt={creator.display_name}
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
                        <p className="font-medium text-foreground truncate">{creator.display_name}</p>
                        <p className="text-sm text-accent font-mono truncate">{creator.face_tag}</p>
                        {creator.bio && <p className="text-sm text-secondary truncate mt-1">{creator.bio}</p>}
                      </div>
                      <ChevronRight className="h-5 w-5 text-secondary flex-shrink-0" />
                    </Link>

                    <div className="flex items-center gap-2 border-t border-border p-3 bg-muted/30">
                      <button
                        onClick={() => toggleNotification(item.id, item.following_id, 'notify_new_event')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                          item.notify_new_event
                            ? 'bg-accent/10 text-accent'
                            : 'bg-muted text-secondary hover:text-foreground'
                        }`}
                      >
                        {item.notify_new_event ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                        <span className="text-sm font-medium">Events</span>
                      </button>

                      <button
                        onClick={() => toggleNotification(item.id, item.following_id, 'notify_photo_drop')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                          item.notify_photo_drop
                            ? 'bg-accent/10 text-accent'
                            : 'bg-muted text-secondary hover:text-foreground'
                        }`}
                      >
                        {item.notify_photo_drop ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                        <span className="text-sm font-medium">Photos</span>
                      </button>

                      <button
                        onClick={() => handleUnfollowCreator(item.following_id, creator.display_name)}
                        className="flex items-center justify-center h-9 w-9 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        title="Unfollow"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {filteredAttendeeFollowing.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-secondary">Attendees</h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {filteredAttendeeFollowing.map((item) => {
                    const attendee = item.attendees;
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-4">
                        <Link
                          href={`/gallery/people/attendee/${attendee.public_profile_slug || attendee.face_tag?.replace(/^@/, '') || attendee.id}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          {attendee.profile_photo_url ? (
                            <Image
                              src={attendee.profile_photo_url}
                              alt={attendee.display_name}
                              width={44}
                              height={44}
                              className="h-11 w-11 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                              <User className="h-5 w-5 text-secondary" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{attendee.display_name}</p>
                            <p className="text-sm text-accent font-mono truncate">{attendee.face_tag}</p>
                          </div>
                        </Link>
                        <button
                          onClick={() => handleUnfollowAttendee(item.following_id, attendee.display_name)}
                          className="flex items-center justify-center h-9 w-9 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                          title="Unfollow"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
