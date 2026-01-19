'use client';

import {
  Scan,
  Image as ImageIcon,
  Heart,
  Download,
  Share2,
  Calendar,
  MapPin,
  ChevronRight,
  Sparkles,
  Camera,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

// ============================================
// PHOTO PASSPORT - MAIN ATTENDEE GALLERY
// ============================================

interface MatchedPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  eventLocation?: string;
  photographerName: string;
  matchedAt: string;
  confidence: number;
  isPurchased: boolean;
  isWatermarked: boolean;
}

interface EventGroup {
  id: string;
  name: string;
  date: string;
  location?: string;
  photographerName: string;
  coverImage?: string;
  photos: MatchedPhoto[];
  totalPhotos: number;
}

export default function PhotoPassportPage() {
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasScanned, setHasScanned] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const response = await fetch('/api/attendee/matches');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load matches');
        }

        setHasScanned(!!data.hasScanned);
        setEventGroups(data.eventGroups || []);
      } catch (error) {
        console.error('Failed to fetch photos:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPhotos();
  }, []);

  useRealtimeSubscription({
    table: 'photo_drop_matches',
    onChange: () => {
      setIsLoading(true);
      fetch('/api/attendee/matches')
        .then((res) => res.json())
        .then((data) => {
          setHasScanned(!!data.hasScanned);
          setEventGroups(data.eventGroups || []);
        })
        .finally(() => setIsLoading(false));
    },
  });

  useRealtimeSubscription({
    table: 'entitlements',
    onChange: () => {
      setIsLoading(true);
      fetch('/api/attendee/matches')
        .then((res) => res.json())
        .then((data) => {
          setHasScanned(!!data.hasScanned);
          setEventGroups(data.eventGroups || []);
        })
        .finally(() => setIsLoading(false));
    },
  });

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // Empty state - user hasn't scanned their face yet
  if (!hasScanned) {
    return (
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/20 p-8 md:p-12">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium text-accent">Photo Passport</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Find yourself in every photo
            </h1>
            <p className="text-lg text-secondary mb-8">
              Scan your face once and we&apos;ll automatically find all your photos across every event. 
              No more scrolling through thousands of photos!
            </p>
            <Button asChild size="lg" variant="primary">
              <Link href="/gallery/scan">
                <Scan className="mr-2 h-5 w-5" />
                Scan My Face
              </Link>
            </Button>
          </div>
        </div>

        {/* How It Works */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-6">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                <Camera className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">1. Take a selfie</h3>
              <p className="text-sm text-secondary">
                We&apos;ll use your face to find matching photos. Your privacy is protected.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                <ImageIcon className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">2. Find your photos</h3>
              <p className="text-sm text-secondary">
                Our AI instantly matches you across all events you&apos;ve attended.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                <Download className="h-6 w-6 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">3. Download & share</h3>
              <p className="text-sm text-secondary">
                Purchase photos you love, download instantly, and share with friends.
              </p>
            </div>
          </div>
        </div>

        {/* Browse Events */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">Browse events</h2>
            <Link 
              href="/gallery/events" 
              className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-foreground mb-2">No events found</h3>
            <p className="text-sm text-secondary mb-4">
              Have an event access code? Enter it to view event photos.
            </p>
            <Button asChild variant="secondary">
              <Link href="/gallery/events">Enter Event Code</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // User has scanned but no matches found
  if (eventGroups.length === 0) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Photos</h1>
            <p className="text-secondary mt-1">Your Photo Passport is ready</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/gallery/scan">
              <Scan className="mr-2 h-4 w-4" />
              Scan Again
            </Link>
          </Button>
        </div>

        {/* Empty State */}
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">No photos found yet</h2>
          <p className="text-secondary max-w-md mx-auto mb-6">
            We haven&apos;t found any photos with your face yet. As photographers upload photos 
            from events you attend, they&apos;ll appear here automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="primary">
              <Link href="/gallery/events">Browse Events</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/gallery/notifications">Enable Notifications</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // User has matched photos
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Photos</h1>
          <p className="text-secondary mt-1">
            {eventGroups.reduce((sum, g) => sum + g.totalPhotos, 0)} photos across{' '}
            {eventGroups.length} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPhotos.size > 0 && (
            <Button variant="primary">
              <Download className="mr-2 h-4 w-4" />
              Download ({selectedPhotos.size})
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link href="/gallery/scan">
              <Scan className="mr-2 h-4 w-4" />
              Scan
            </Link>
          </Button>
        </div>
      </div>

      {/* Photo Grid by Event */}
      <div className="space-y-8">
        {eventGroups.map((group) => (
          <div key={group.id} className="space-y-4">
            {/* Event Header */}
            <Link
              href={`/gallery/events/${group.id}`}
              className="flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                {group.coverImage ? (
                  <Image
                    src={group.coverImage}
                    alt={group.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                    <Calendar className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h2 className="font-semibold text-foreground group-hover:text-accent transition-colors">
                    {group.name}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-secondary">
                    <span>{group.date}</span>
                    {group.location && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{group.location}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-secondary group-hover:text-accent transition-colors">
                <span className="text-sm">{group.totalPhotos} photos</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Link>

            {/* Photo Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {group.photos.slice(0, 5).map((photo) => (
                <div
                  key={photo.id}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-muted cursor-pointer"
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  <Image
                    src={photo.thumbnailUrl}
                    alt="Matched photo"
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  
                  {/* Selection Overlay */}
                  <div
                    className={`absolute inset-0 transition-all ${
                      selectedPhotos.has(photo.id)
                        ? 'bg-accent/20 ring-2 ring-accent ring-inset'
                        : 'group-hover:bg-black/10'
                    }`}
                  />
                  
                  {/* Selection Checkbox */}
                  <div
                    className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                      selectedPhotos.has(photo.id)
                        ? 'border-accent bg-accent text-white'
                        : 'border-white/80 bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {selectedPhotos.has(photo.id) && (
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm hover:bg-white transition-colors">
                      <Heart className="h-4 w-4" />
                    </button>
                    <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm hover:bg-white transition-colors">
                      <Share2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Watermark Badge */}
                  {photo.isWatermarked && !photo.isPurchased && (
                    <div className="absolute top-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Preview
                    </div>
                  )}
                </div>
              ))}
              
              {/* View All Card */}
              {group.totalPhotos > 5 && (
                <Link
                  href={`/gallery/events/${group.id}`}
                  className="flex aspect-square items-center justify-center rounded-xl bg-muted text-secondary hover:bg-muted/80 transition-colors"
                >
                  <div className="text-center">
                    <p className="text-2xl font-bold text-foreground">+{group.totalPhotos - 5}</p>
                    <p className="text-xs">more</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
