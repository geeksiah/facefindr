'use client';

import {
  ArrowLeft,
  Calendar,
  MapPin,
  Camera,
  Download,
  Share2,
  Heart,
  ShoppingCart,
  Check,
  X,
  ZoomIn,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { RatingsDisplay } from '@/components/photographer/ratings-display';
import { FollowButton } from '@/components/social/follow-button';
import { PhotoReactions } from '@/components/social/photo-reactions';
import { TipCreator } from '@/components/social/tip-photographer';
import { Button } from '@/components/ui/button';

interface EventPhoto {
  id: string;
  url: string;
  thumbnailUrl: string;
  isPurchased: boolean;
  isWatermarked: boolean;
  price: number;
}

interface EventDetails {
  id: string;
  name: string;
  date: string;
  location?: string;
  coverImage?: string;
  photographerId?: string;
  photographerName: string;
  photographerAvatar?: string;
  description?: string;
  totalPhotos: number;
  matchedPhotos: EventPhoto[];
  pricing: {
    pricePerPhoto: number;
    unlockAllPrice?: number;
    currency: string;
    isFree: boolean;
  };
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id as string;

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [viewingPhoto, setViewingPhoto] = useState<EventPhoto | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [downloadedPhoto, setDownloadedPhoto] = useState<EventPhoto | null>(null);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/attendee-view`);
        if (response.ok) {
          const data = await response.json();
          setEvent(data);
        } else {
          router.push('/gallery/events');
        }
      } catch (error) {
        console.error('Failed to fetch event:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (eventId) {
      fetchEvent();
    }
  }, [eventId, router]);

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

  const selectAll = () => {
    if (event) {
      setSelectedPhotos(new Set(event.matchedPhotos.map((p) => p.id)));
    }
  };

  const clearSelection = () => {
    setSelectedPhotos(new Set());
  };

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100);
  };

  const calculateTotal = () => {
    if (!event) return 0;
    return Array.from(selectedPhotos).reduce((total, photoId) => {
      const photo = event.matchedPhotos.find((p) => p.id === photoId);
      return total + (photo?.isPurchased ? 0 : photo?.price || 0);
    }, 0);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-secondary">Event not found</p>
        <Button asChild variant="primary" className="mt-4">
          <Link href="/gallery/events">Back to Events</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/gallery/events"
        className="inline-flex items-center gap-2 text-sm text-secondary hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </Link>

      {/* Event Header */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Cover Image */}
        {event.coverImage && (
          <div className="relative h-48 sm:h-64">
            <Image
              src={event.coverImage}
              alt={event.name}
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}

        {/* Event Info */}
        <div className={`p-6 ${event.coverImage ? '-mt-20 relative z-10' : ''}`}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className={event.coverImage ? 'text-white' : ''}>
              <h1 className={`text-2xl font-bold ${event.coverImage ? 'text-white' : 'text-foreground'}`}>
                {event.name}
              </h1>
              <div className={`flex flex-wrap items-center gap-3 text-sm mt-2 ${event.coverImage ? 'text-white/80' : 'text-secondary'}`}>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{event.date}</span>
                </div>
                {event.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Creator Info */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              {event.photographerAvatar ? (
                <Image
                  src={event.photographerAvatar}
                  alt={event.photographerName}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white font-medium">
                  {event.photographerName.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <p className={`text-sm ${event.coverImage ? 'text-white/60' : 'text-secondary'}`}>
                  Photographed by
                </p>
                <p className={`font-medium ${event.coverImage ? 'text-white' : 'text-foreground'}`}>
                  {event.photographerName}
                </p>
                {event.photographerId && (
                  <>
                    <RatingsDisplay
                      photographerId={event.photographerId}
                      showRatingButton={true}
                      eventId={event.id}
                      variant="compact"
                      className="mt-1"
                    />
                    <div className="mt-2">
                      <FollowButton
                        photographerId={event.photographerId}
                        photographerName={event.photographerName}
                        variant="ghost"
                        size="sm"
                        className={event.coverImage ? 'text-white/80 hover:text-white' : ''}
                      />
                    </div>
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const suggestedPhoto = event.matchedPhotos.find((photo) => photo.isPurchased) || event.matchedPhotos[0] || null;
                          setDownloadedPhoto(suggestedPhoto);
                          setShowTipModal(true);
                        }}
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Tip Creator
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {event.description && (
            <p className={`mt-4 text-sm ${event.coverImage ? 'text-white/80' : 'text-secondary'}`}>
              {event.description}
            </p>
          )}
        </div>
      </div>

      {/* Photos Section */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Your Photos</h2>
            <p className="text-sm text-secondary">
              {event.matchedPhotos.length} photos found with your face
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedPhotos.size > 0 ? (
              <>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
                <Button variant="secondary" size="sm" onClick={selectAll}>
                  Select All ({event.matchedPhotos.length})
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={selectAll}>
                Select All
              </Button>
            )}
          </div>
        </div>

        {/* Photo Grid */}
        {event.matchedPhotos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {event.matchedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-xl bg-muted cursor-pointer"
                onClick={() => togglePhotoSelection(photo.id)}
              >
                <Image
                  src={photo.thumbnailUrl}
                  alt="Event photo"
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />

                {/* Watermark overlay for unpurchased */}
                {photo.isWatermarked && !photo.isPurchased && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white/30 font-bold text-2xl rotate-[-30deg] select-none">
                      PREVIEW
                    </p>
                  </div>
                )}

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
                  {selectedPhotos.has(photo.id) && <Check className="h-3 w-3" />}
                </div>

                {/* Purchased Badge */}
                {photo.isPurchased && (
                  <div className="absolute top-2 right-2 rounded-md bg-success px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Purchased
                  </div>
                )}

                {/* Price Badge (if not purchased) */}
                {!photo.isPurchased && !event.pricing.isFree && (
                  <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
                    {formatPrice(photo.price, event.pricing.currency)}
                  </div>
                )}

                {/* Reactions - Show on hover */}
                <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <PhotoReactions mediaId={photo.id} variant="compact" />
                </div>

                {/* Quick Actions */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingPhoto(photo);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm hover:bg-white transition-colors"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Camera className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-foreground mb-2">No photos found</h3>
            <p className="text-sm text-secondary">
              We couldn&apos;t find any photos with your face in this event.
            </p>
          </div>
        )}
      </div>

      {/* Purchase Bar (sticky at bottom) */}
      {selectedPhotos.size > 0 && !event.pricing.isFree && (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-sm p-4 z-40">
          <div className="mx-auto max-w-7xl flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">
                {selectedPhotos.size} photo{selectedPhotos.size > 1 ? 's' : ''} selected
              </p>
              <p className="text-sm text-secondary">
                Total: {formatPrice(calculateTotal(), event.pricing.currency)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={clearSelection}>
                Cancel
              </Button>
              <Button variant="primary">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Purchase
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {viewingPhoto && (
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/90"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          <button
            onClick={() => setViewingPhoto(null)}
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative max-w-4xl w-full aspect-[4/3]">
            <Image
              src={viewingPhoto.url}
              alt="Photo preview"
              fill
              className="object-contain"
            />
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            {viewingPhoto.isPurchased ? (
              <Button variant="primary">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            ) : (
              <Button variant="primary">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Purchase {formatPrice(viewingPhoto.price, event.pricing.currency)}
              </Button>
            )}
            <Button variant="secondary">
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      )}

      {/* Tip Modal */}
      {showTipModal && event && (
        <div 
          className="fixed z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
          }}
          onClick={() => setShowTipModal(false)}
        >
          <div
            className="bg-card rounded-2xl border border-border p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <TipCreator
              photographerId={event.photographerId || event.id}
              photographerName={event.photographerName}
              eventId={event.id}
              mediaId={downloadedPhoto?.id}
              currency={event.pricing.currency}
              onSuccess={() => {
                setShowTipModal(false);
                setDownloadedPhoto(null);
              }}
              onCancel={() => {
                setShowTipModal(false);
                setDownloadedPhoto(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

