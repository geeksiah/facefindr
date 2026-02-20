'use client';

/**
 * Followers Page (Creator Dashboard)
 * 
 * Shows list of attendees following the photographer.
 */

import {
  ArrowLeft,
  Users,
  Search,
  Mail,
  Calendar,
  TrendingUp,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface FollowerItem {
  id: string;
  follower_id: string;
  follower_type?: 'attendee' | 'creator' | 'photographer';
  notify_new_event: boolean;
  notify_photo_drop: boolean;
  created_at: string;
  attendees?: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    email: string;
  } | null;
  photographers?: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    public_profile_slug?: string | null;
    email?: string | null;
  } | null;
}

interface FollowerStats {
  total: number;
  newThisWeek: number;
  newThisMonth: number;
  withEventNotifications: number;
  withPhotoNotifications: number;
}

export default function FollowersPage() {
  const router = useRouter();
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [stats, setStats] = useState<FollowerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  const loadFollowers = useCallback(async () => {
    try {
      const response = await fetch('/api/social/follow?type=followers');
      if (response.ok) {
        const data = await response.json();
        setFollowers(data.followers || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error('Error loading followers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFollowers();
  }, [loadFollowers]);

  // Subscribe to realtime updates
  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    onChange: () => loadFollowers(),
  });

  // Poll fallback when realtime transport is unavailable.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        void loadFollowers();
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, loadFollowers]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadFollowers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadFollowers]);

  const filteredFollowers = followers
    .filter((item) => {
      const profile = item.attendees || item.photographers;
      if (!profile) return false;
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        profile.display_name.toLowerCase().includes(query) ||
        profile.face_tag?.toLowerCase().includes(query) ||
        (item.attendees?.email || '').toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const aProfile = a.attendees || a.photographers;
      const bProfile = b.attendees || b.photographers;
      if (sortBy === 'name') {
        return (aProfile?.display_name || '').localeCompare(bProfile?.display_name || '');
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-52 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((key) => (
              <div key={key} className="flex animate-pulse items-center gap-4 border-b border-border pb-3 last:border-0">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 rounded bg-muted" />
                  <div className="h-3 w-40 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Followers</h1>
            <p className="text-secondary">
              {stats?.total || 0} attendee{(stats?.total || 0) !== 1 ? 's' : ''} following you
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-secondary">Total Followers</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.newThisWeek}</p>
                <p className="text-xs text-secondary">This Week</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.withEventNotifications}</p>
                <p className="text-xs text-secondary">Event Alerts On</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Mail className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.withPhotoNotifications}</p>
                <p className="text-xs text-secondary">Photo Alerts On</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Sort */}
      {followers.length > 5 && (
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search followers..."
              className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
            className="rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            <option value="recent">Most Recent</option>
            <option value="name">Name A-Z</option>
          </select>
        </div>
      )}

      {/* Followers List */}
      {filteredFollowers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">
            {searchQuery ? 'No results found' : 'No followers yet'}
          </h3>
          <p className="text-sm text-secondary mb-6">
            {searchQuery
              ? 'Try a different search term'
              : 'Share your profile and events to attract followers'}
          </p>
          {!searchQuery && (
            <Button asChild>
              <Link href="/dashboard/events">View Your Events</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {filteredFollowers.map((item) => {
              const attendee = item.attendees || item.photographers;
              if (!attendee) return null;
              const followDate = new Date(item.created_at);
              const isNew =
                Date.now() - followDate.getTime() < 7 * 24 * 60 * 60 * 1000; // 7 days

              return (
                <Link
                  key={item.id}
                  href={
                    item.attendees
                      ? `/dashboard/people/attendee/${attendee.face_tag?.replace('@', '') || attendee.id}`
                      : `/dashboard/people/creator/${(item.photographers?.public_profile_slug || attendee.face_tag?.replace('@', '') || attendee.id)}`
                  }
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {attendee.profile_photo_url ? (
                    <Image
                      src={attendee.profile_photo_url}
                      alt={attendee.display_name}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                      {attendee.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">
                        {attendee.display_name}
                      </p>
                      {isNew && (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-accent font-mono truncate">
                      {attendee.face_tag}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-secondary">
                        Followed {followDate.toLocaleDateString()}
                      </span>
                      {item.notify_new_event && (
                        <span className="flex items-center gap-1 text-xs text-secondary">
                          <Calendar className="h-3 w-3" />
                          Events
                        </span>
                      )}
                      {item.notify_photo_drop && (
                        <span className="flex items-center gap-1 text-xs text-secondary">
                          <Mail className="h-3 w-3" />
                          Photos
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-secondary flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
