'use client';

import { ArrowLeft, Loader2, Search, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

interface FollowersResponse {
  profile: {
    id: string;
    display_name: string;
    face_tag: string | null;
    profile_photo_url: string | null;
    public_profile_slug: string | null;
  };
  followers: Array<{
    id: string;
    follower_id: string;
    follower_type: 'attendee' | 'creator';
    created_at: string;
    profile: {
      id: string;
      display_name: string;
      face_tag: string | null;
      profile_photo_url: string | null;
      public_profile_slug?: string | null;
    };
  }>;
  total: number;
}

export default function UserFollowersPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [data, setData] = useState<FollowersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/profiles/user/${slug}/followers`);
        const payload = await res.json();
        if (!res.ok) {
          setError(payload.error || 'Failed to load followers');
          return;
        }
        setData(payload);
      } catch (err) {
        setError('Failed to load followers');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [slug]);

  const filteredFollowers = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.followers;
    const q = searchQuery.trim().toLowerCase();
    return data.followers.filter((item) => {
      const displayName = item.profile.display_name?.toLowerCase() || '';
      const faceTag = item.profile.face_tag?.toLowerCase() || '';
      return displayName.includes(q) || faceTag.includes(q);
    });
  }, [data, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !data) {
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
              <p className="text-sm text-secondary">{data.total} followers</p>
            </div>
          </div>
          <Link href="/">
            <Logo variant="icon" className="h-8" />
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Link
          href={`/u/${data.profile.public_profile_slug || data.profile.face_tag?.replace(/^@/, '') || data.profile.id}`}
          className="mb-6 flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors"
        >
          {data.profile.profile_photo_url ? (
            <Image
              src={data.profile.profile_photo_url}
              alt={data.profile.display_name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {data.profile.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground">{data.profile.display_name}</p>
            <p className="text-sm text-accent font-mono">{data.profile.face_tag}</p>
          </div>
        </Link>

        {data.followers.length > 5 && (
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

        {filteredFollowers.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              {searchQuery ? 'No results found' : 'No followers yet'}
            </h3>
            <p className="text-sm text-secondary">
              {searchQuery ? 'Try a different search term' : 'No one is following this attendee yet.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {filteredFollowers.map((item) => {
                const profile = item.profile;
                const target =
                  item.follower_type === 'creator'
                    ? `/p/${profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id}`
                    : `/u/${profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id}`;

                return (
                  <Link
                    key={item.id}
                    href={target}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                  >
                    {profile.profile_photo_url ? (
                      <Image
                        src={profile.profile_photo_url}
                        alt={profile.display_name}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
                        {profile.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{profile.display_name}</p>
                      <p className="text-sm text-accent font-mono truncate">{profile.face_tag}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-secondary">
                      {item.follower_type === 'creator' ? 'Creator' : 'Attendee'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
