'use client';

/**
 * Photographer Followers Page (Public)
 * 
 * Shows list of followers for a photographer's public profile.
 */

import {
  ArrowLeft,
  Users,
  Camera,
  Search,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

interface FollowerItem {
  id: string;
  follower_id: string;
  created_at: string;
  attendees: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
  };
}

interface PhotographerInfo {
  id: string;
  display_name: string;
  face_tag: string;
  profile_photo_url: string | null;
  public_profile_slug: string | null;
}

export default function PhotographerFollowersPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [photographer, setPhotographer] = useState<PhotographerInfo | null>(null);
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      // Load photographer info
      const profileRes = await fetch(`/api/profiles/photographer/${slug}`);
      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error || 'Profile not found');
        return;
      }
      const profileData = await profileRes.json();
      setPhotographer(profileData.profile);

      // Load followers
      const followersRes = await fetch(`/api/social/follow?type=followers&photographerId=${profileData.profile.id}`);
      if (followersRes.ok) {
        const followersData = await followersRes.json();
        setFollowers(followersData.followers || []);
        setTotal(followersData.total || 0);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredFollowers = followers.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.attendees.display_name.toLowerCase().includes(query) ||
      item.attendees.face_tag?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !photographer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Not Found</h1>
          <p className="text-secondary mb-6">{error || 'This page does not exist.'}</p>
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Followers</h1>
              <p className="text-sm text-secondary">{total} followers</p>
            </div>
          </div>
          <Link href="/">
            <Logo variant="icon" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Photographer Info */}
        <Link
          href={`/p/${photographer.public_profile_slug || photographer.id}`}
          className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card mb-6 hover:bg-muted/50 transition-colors"
        >
          {photographer.profile_photo_url ? (
            <Image
              src={photographer.profile_photo_url}
              alt={photographer.display_name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Camera className="h-6 w-6 text-secondary" />
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{photographer.display_name}</p>
            <p className="text-sm text-accent font-mono">{photographer.face_tag}</p>
          </div>
        </Link>

        {/* Search */}
        {followers.length > 5 && (
          <div className="relative mb-6">
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

        {/* Followers List */}
        {filteredFollowers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {searchQuery ? 'No results found' : 'No followers yet'}
            </h3>
            <p className="text-sm text-secondary">
              {searchQuery
                ? 'Try a different search term'
                : 'Be the first to follow this photographer!'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {filteredFollowers.map((item) => {
                const attendee = item.attendees;

                return (
                  <Link
                    key={item.id}
                    href={`/u/${attendee.face_tag?.replace('@', '') || attendee.id}`}
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
                      <p className="font-medium text-foreground truncate">
                        {attendee.display_name}
                      </p>
                      <p className="text-sm text-accent font-mono truncate">
                        {attendee.face_tag}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>

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
