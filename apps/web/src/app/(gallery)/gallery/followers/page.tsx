'use client';

import { ArrowLeft, Loader2, Search, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface FollowersPayload {
  followers: Array<{
    id: string;
    follower_id: string;
    follower_type: 'attendee' | 'creator' | 'photographer';
    created_at: string;
    attendees?: {
      id: string;
      display_name: string;
      face_tag: string | null;
      profile_photo_url: string | null;
    } | null;
    photographers?: {
      id: string;
      display_name: string;
      face_tag: string | null;
      profile_photo_url: string | null;
      public_profile_slug?: string | null;
    } | null;
  }>;
  total: number;
  stats?: {
    total: number;
    newThisWeek: number;
    newThisMonth: number;
  };
}

type Row = {
  id: string;
  createdAt: string;
  followerType: 'attendee' | 'creator';
  profile: {
    id: string;
    displayName: string;
    faceTag: string | null;
    photoUrl: string | null;
    slug?: string | null;
  };
};

export default function GalleryFollowersPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFollowers = useCallback(async () => {
    try {
      const response = await fetch('/api/social/follow?type=followers&targetType=attendee', {
        cache: 'no-store',
      });
      if (!response.ok) {
        setRows([]);
        setTotal(0);
        return;
      }

      const payload = (await response.json()) as FollowersPayload;
      const normalized: Row[] = (payload.followers || [])
        .map((item) => {
          const followerType =
            item.follower_type === 'creator' || item.follower_type === 'photographer'
              ? 'creator'
              : 'attendee';
          const profile =
            followerType === 'creator'
              ? item.photographers
              : item.attendees;

          if (!profile?.id) return null;

          return {
            id: item.id,
            createdAt: item.created_at,
            followerType,
            profile: {
              id: profile.id,
              displayName: profile.display_name,
              faceTag: profile.face_tag,
              photoUrl: profile.profile_photo_url,
              slug: followerType === 'creator' ? (profile as any).public_profile_slug || null : null,
            },
          } as Row;
        })
        .filter(Boolean) as Row[];

      setRows(normalized);
      setTotal(payload.total || normalized.length);
    } catch (error) {
      console.error('Failed to load attendee followers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFollowers();
  }, [loadFollowers]);

  const { isConnected } = useRealtimeSubscription({
    table: 'follows',
    onChange: () => {
      void loadFollowers();
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        void loadFollowers();
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [isConnected, loadFollowers]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const name = row.profile.displayName.toLowerCase();
      const tag = row.profile.faceTag?.toLowerCase() || '';
      return name.includes(q) || tag.includes(q);
    });
  }, [rows, searchQuery]);

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
          <h1 className="text-2xl font-bold text-foreground">Followers</h1>
          <p className="text-secondary">{total} account{total !== 1 ? 's' : ''} follow you</p>
        </div>
      </div>

      {rows.length > 5 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search followers..."
            className="w-full rounded-xl border border-border bg-background pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>
      )}

      {filteredRows.length === 0 ? (
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
              : 'When people follow you, they appear here.'}
          </p>
          {!searchQuery && (
            <Button asChild>
              <Link href="/gallery/events">Explore Creators</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {filteredRows.map((row) => {
              const href =
                row.followerType === 'creator'
                  ? `/gallery/people/creator/${row.profile.slug || row.profile.faceTag?.replace(/^@/, '') || row.profile.id}`
                  : `/gallery/people/attendee/${row.profile.faceTag?.replace(/^@/, '') || row.profile.id}`;

              return (
                <Link
                  key={row.id}
                  href={href}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {row.profile.photoUrl ? (
                    <Image
                      src={row.profile.photoUrl}
                      alt={row.profile.displayName}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                      {row.profile.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{row.profile.displayName}</p>
                    <p className="text-sm text-accent font-mono truncate">{row.profile.faceTag}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-secondary">
                    {row.followerType === 'creator' ? 'Creator' : 'Attendee'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
