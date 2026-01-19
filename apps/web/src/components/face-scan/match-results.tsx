'use client';

import {
  CheckCircle2,
  ChevronRight,
  Download,
  ShoppingCart,
  Calendar,
  MapPin,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface MatchedPhoto {
  mediaId: string;
  thumbnailUrl: string;
  similarity: number;
  isPurchased?: boolean;
}

interface EventMatch {
  eventId: string;
  eventName: string;
  eventDate?: string;
  eventLocation?: string;
  coverImage?: string;
  photos: MatchedPhoto[];
}

interface MatchResultsProps {
  matches: EventMatch[];
  totalMatches: number;
  onViewEvent: (eventId: string) => void;
  onPurchase: (mediaIds: string[], eventId: string) => void;
}

export function MatchResults({
  matches,
  totalMatches,
  onViewEvent,
  onPurchase,
}: MatchResultsProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Record<string, Set<string>>>({});
  const [expandedEvent, setExpandedEvent] = useState<string | null>(
    matches.length === 1 ? matches[0].eventId : null
  );

  const togglePhotoSelection = (eventId: string, mediaId: string) => {
    setSelectedPhotos((prev) => {
      const eventSelection = new Set(prev[eventId] || []);
      if (eventSelection.has(mediaId)) {
        eventSelection.delete(mediaId);
      } else {
        eventSelection.add(mediaId);
      }
      return { ...prev, [eventId]: eventSelection };
    });
  };

  const getSelectedCount = (eventId: string) => {
    return selectedPhotos[eventId]?.size || 0;
  };

  const handlePurchase = (eventId: string) => {
    const selected = selectedPhotos[eventId];
    if (selected && selected.size > 0) {
      onPurchase(Array.from(selected), eventId);
    }
  };

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <Sparkles className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No matches found</h3>
        <p className="text-secondary max-w-sm mx-auto">
          We couldn&apos;t find any photos with your face. This could mean the events you attended
          haven&apos;t been uploaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {totalMatches} photo{totalMatches !== 1 ? 's' : ''} found!
            </h2>
            <p className="text-sm text-secondary">
              Across {matches.length} event{matches.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Event Groups */}
      <div className="space-y-4">
        {matches.map((event) => {
          const isExpanded = expandedEvent === event.eventId;
          const selectedCount = getSelectedCount(event.eventId);

          return (
            <div
              key={event.eventId}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              {/* Event Header */}
              <button
                onClick={() => setExpandedEvent(isExpanded ? null : event.eventId)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-4">
                  {event.coverImage ? (
                    <Image
                      src={event.coverImage}
                      alt={event.eventName}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                      <Calendar className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-foreground">{event.eventName}</h3>
                    <div className="flex items-center gap-2 text-sm text-secondary mt-0.5">
                      {event.eventDate && <span>{event.eventDate}</span>}
                      {event.eventLocation && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{event.eventLocation}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-foreground">{event.photos.length}</p>
                    <p className="text-xs text-secondary">matches</p>
                  </div>
                  <ChevronRight
                    className={`h-5 w-5 text-secondary transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Expanded Photo Grid */}
              {isExpanded && (
                <div className="border-t border-border p-4">
                  {/* Photo Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {event.photos.map((photo) => {
                      const isSelected = selectedPhotos[event.eventId]?.has(photo.mediaId);
                      
                      return (
                        <div
                          key={photo.mediaId}
                          onClick={() => togglePhotoSelection(event.eventId, photo.mediaId)}
                          className="group relative aspect-square overflow-hidden rounded-xl bg-muted cursor-pointer"
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
                              isSelected
                                ? 'bg-accent/20 ring-2 ring-accent ring-inset'
                                : 'group-hover:bg-black/10'
                            }`}
                          />

                          {/* Selection Checkbox */}
                          <div
                            className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all text-[10px] ${
                              isSelected
                                ? 'border-accent bg-accent text-white'
                                : 'border-white/80 bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isSelected && '✓'}
                          </div>

                          {/* Similarity Badge */}
                          <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {Math.round(photo.similarity)}%
                          </div>

                          {/* Purchased Badge */}
                          {photo.isPurchased && (
                            <div className="absolute top-2 right-2 rounded bg-success px-1.5 py-0.5 text-[10px] font-medium text-white">
                              ✓
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                    <Link
                      href={`/gallery/events/${event.eventId}`}
                      className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
                    >
                      View all event photos →
                    </Link>

                    <div className="flex items-center gap-2">
                      {selectedCount > 0 && (
                        <>
                          <span className="text-sm text-secondary">
                            {selectedCount} selected
                          </span>
                          <Button variant="primary" size="sm" onClick={() => handlePurchase(event.eventId)}>
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            Purchase
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* View All Button */}
      <div className="text-center">
        <Button asChild variant="secondary">
          <Link href="/gallery">
            <Download className="mr-2 h-4 w-4" />
            View Photo Passport
          </Link>
        </Button>
      </div>
    </div>
  );
}
