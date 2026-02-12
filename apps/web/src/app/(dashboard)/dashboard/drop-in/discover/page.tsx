'use client';

/**
 * Drop-In Discovery Page
 * 
 * Premium users can discover drop-in photos of themselves
 */

import {
  Eye,
  MapPin,
  Calendar,
  User,
  Gift,
  Lock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface DropInPhoto {
  matchId: string;
  photoId: string;
  thumbnailUrl: string | null;
  confidence: number;
  uploadedAt: string;
  locationName: string | null;
  uploader: {
    id: string;
    display_name: string;
    face_tag: string;
  } | null;
  isGifted: boolean;
  giftMessage: string | null;
}

export default function DropInDiscoverPage() {
  const router = useRouter();
  const toast = useToast();
  
  const [photos, setPhotos] = useState<DropInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<DropInPhoto | null>(null);
  const [showGiftMessage, setShowGiftMessage] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const response = await fetch('/api/drop-in/discover');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          // Premium required
          toast.error('Premium Required', data.error || 'Upgrade to Premium to discover drop-in photos');
          router.push('/dashboard/subscription');
          return;
        }
        throw new Error(data.error || 'Failed to load photos');
      }

      setPhotos(data.photos || []);
    } catch (error: any) {
      console.error('Load photos error:', error);
      toast.error('Error', error.message || 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  const handleViewPhoto = async (photo: DropInPhoto) => {
    // Mark notification as viewed
    try {
      await fetch('/api/drop-in/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: photo.matchId, // Using matchId as notification identifier
          action: 'view',
        }),
      });
    } catch (error) {
      console.error('Failed to mark as viewed:', error);
    }

    setSelectedPhoto(photo);
    if (photo.isGifted && photo.giftMessage) {
      setShowGiftMessage(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Drop-In Photos</h1>
        <p className="mt-2 text-secondary">
          Photos of you uploaded by people outside your contacts
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/10 p-2.5">
              <Eye className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-secondary">Total Found</p>
              <p className="text-2xl font-bold text-foreground">{photos.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-2.5">
              <Gift className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-secondary">Gifted</p>
              <p className="text-2xl font-bold text-foreground">
                {photos.filter(p => p.isGifted).length}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-500/10 p-2.5">
              <Sparkles className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-secondary">Premium Only</p>
              <p className="text-2xl font-bold text-foreground">
                {photos.filter(p => !p.isGifted).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      {photos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No drop-in photos found
          </h3>
          <p className="text-secondary">
            When someone uploads a photo of you outside your contacts, it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.photoId}
              className="group relative rounded-2xl border border-border bg-card overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-accent/50"
              onClick={() => handleViewPhoto(photo)}
            >
              {photo.thumbnailUrl ? (
                <div className="relative aspect-square">
                  <img
                    src={photo.thumbnailUrl}
                    alt="Drop-in photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <Eye className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  {photo.uploader && (
                    <p className="font-semibold text-sm mb-1">
                      {photo.uploader.display_name}
                    </p>
                  )}
                  {photo.locationName && (
                    <p className="text-xs opacity-90 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {photo.locationName}
                    </p>
                  )}
                </div>
              </div>

              {/* Badges */}
              <div className="absolute top-2 right-2 flex gap-2">
                {photo.isGifted && (
                  <div className="rounded-full bg-success/90 px-2 py-1 text-xs font-semibold text-white flex items-center gap-1">
                    <Gift className="h-3 w-3" />
                    Gifted
                  </div>
                )}
                {!photo.isGifted && (
                  <div className="rounded-full bg-accent/90 px-2 py-1 text-xs font-semibold text-white flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Premium
                  </div>
                )}
              </div>

              {/* Confidence Badge */}
              <div className="absolute top-2 left-2">
                <div className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                  {Math.round(photo.confidence)}% match
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => {
            setSelectedPhoto(null);
            setShowGiftMessage(false);
          }}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] bg-background rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedPhoto.thumbnailUrl && (
              <>
                <img
                  src={selectedPhoto.thumbnailUrl}
                  alt="Drop-in photo"
                  className="w-full max-h-[70vh] object-contain"
                />
              </>
            )}

            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  {selectedPhoto.uploader && (
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-secondary" />
                      <span className="font-semibold text-foreground">
                        {selectedPhoto.uploader.display_name}
                      </span>
                      <span className="text-sm text-secondary">
                        {selectedPhoto.uploader.face_tag}
                      </span>
                    </div>
                  )}
                  {selectedPhoto.locationName && (
                    <div className="flex items-center gap-2 text-sm text-secondary">
                      <MapPin className="h-4 w-4" />
                      {selectedPhoto.locationName}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-secondary mt-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(selectedPhoto.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-secondary">Match Confidence</div>
                  <div className="text-2xl font-bold text-accent">
                    {Math.round(selectedPhoto.confidence)}%
                  </div>
                </div>
              </div>

              {selectedPhoto.isGifted && selectedPhoto.giftMessage && showGiftMessage && (
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="h-4 w-4 text-accent" />
                    <span className="font-semibold text-foreground">Gift Message</span>
                  </div>
                  <p className="text-foreground">{selectedPhoto.giftMessage}</p>
                </div>
              )}

              {selectedPhoto.isGifted && selectedPhoto.giftMessage && !showGiftMessage && (
                <Button
                  onClick={() => setShowGiftMessage(true)}
                  variant="outline"
                  className="w-full"
                >
                  <Gift className="h-4 w-4 mr-2" />
                  View Gift Message
                </Button>
              )}

              <div className="flex gap-4 pt-4 border-t border-border">
                <Button
                  onClick={() => {
                    setSelectedPhoto(null);
                    setShowGiftMessage(false);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  onClick={async () => {
                    if (!selectedPhoto?.photoId) return;
                    try {
                      const res = await fetch('/api/vault', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          dropInPhotoId: selectedPhoto.photoId,
                          isFavorite: false,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        throw new Error(data.error || 'Failed to save photo');
                      }
                      toast.success('Saved', 'Photo saved to your passport');
                    } catch (error: any) {
                      toast.error('Save failed', error.message || 'Failed to save photo');
                    }
                  }}
                  className="flex-1"
                >
                  Save to Passport
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
