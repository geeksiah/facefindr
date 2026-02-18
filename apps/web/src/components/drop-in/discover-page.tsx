'use client';

import { ArrowLeft, Calendar, Eye, Gift, Loader2, Lock, MapPin, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface DropInPhoto {
  matchId: string;
  notificationId?: string | null;
  connectionDecision?: string | null;
  photoId: string;
  thumbnailUrl: string | null;
  confidence: number;
  uploadedAt: string;
  locationName: string | null;
  uploader: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url?: string | null;
  } | null;
  isGifted: boolean;
  giftMessage: string | null;
}

interface DropInDiscoverPageProps {
  basePath: string;
  upgradePath: string;
}

export function DropInDiscoverPage({ basePath, upgradePath }: DropInDiscoverPageProps) {
  const router = useRouter();
  const toast = useToast();

  const [photos, setPhotos] = useState<DropInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<DropInPhoto | null>(null);
  const [decisionLoading, setDecisionLoading] = useState<'accept_connection' | 'decline_connection' | null>(null);

  useEffect(() => {
    void loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const response = await fetch('/api/drop-in/discover');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Premium Required', data.error || 'Upgrade to access Drop-In discovery');
          router.push(upgradePath);
          return;
        }

        if (response.status === 404) {
          toast.error('Profile not eligible', 'Open Upload Someone to submit a Drop-In photo.');
          router.push(`${basePath}/upload`);
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
    try {
      const response = await fetch('/api/drop-in/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: photo.notificationId || photo.matchId,
          action: 'view',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 402) {
          toast.error('Payment required', data.error || 'Buy Drop-In credits to open this photo');
          router.push(upgradePath);
          return;
        }
        throw new Error(data.error || 'Unable to open Drop-In photo');
      }
    } catch (error) {
      console.error('Failed to mark as viewed:', error);
      toast.error('Open failed', 'Unable to open this Drop-In photo right now');
      return;
    }

    setSelectedPhoto(photo);
  };

  const handleConnectionDecision = async (action: 'accept_connection' | 'decline_connection') => {
    if (!selectedPhoto?.notificationId) return;

    try {
      setDecisionLoading(action);
      const response = await fetch('/api/drop-in/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: selectedPhoto.notificationId,
          action,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update connection decision');
      }

      const nextDecision = action === 'accept_connection' ? 'accepted_connection' : 'declined_connection';
      setSelectedPhoto((previous) =>
        previous ? { ...previous, connectionDecision: nextDecision } : previous
      );
      setPhotos((previous) =>
        previous.map((photo) =>
          photo.matchId === selectedPhoto.matchId ? { ...photo, connectionDecision: nextDecision } : photo
        )
      );
      toast.success(
        action === 'accept_connection' ? 'Connection accepted' : 'Connection declined',
        action === 'accept_connection'
          ? 'Sender has been notified and can now connect with you.'
          : 'Sender has been notified of your decision.'
      );
    } catch (error: any) {
      toast.error('Decision failed', error.message || 'Unable to save your decision');
    } finally {
      setDecisionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link href={basePath}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Drop-In Hub
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold text-foreground">Drop-In Photos</h1>
        <p className="mt-2 text-secondary">Photos of you uploaded by people outside your contacts</p>
      </div>

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
              <p className="text-2xl font-bold text-foreground">{photos.filter((p) => p.isGifted).length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/10 p-2.5">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-secondary">Premium Only</p>
              <p className="text-2xl font-bold text-foreground">
                {photos.filter((p) => !p.isGifted).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Eye className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold text-foreground">No drop-in photos found</h3>
          <p className="text-secondary">When someone uploads a photo of you, it will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <div
              key={photo.photoId}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-accent/50 hover:shadow-lg"
              onClick={() => handleViewPhoto(photo)}
            >
              {photo.thumbnailUrl ? (
                <div className="relative aspect-square">
                  <img src={photo.thumbnailUrl} alt="Drop-in photo" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-muted">
                  <Eye className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  {photo.uploader && <p className="mb-1 text-sm font-semibold">{photo.uploader.display_name}</p>}
                  {photo.locationName && (
                    <p className="flex items-center gap-1 text-xs opacity-90">
                      <MapPin className="h-3 w-3" />
                      {photo.locationName}
                    </p>
                  )}
                </div>
              </div>

              <div className="absolute right-2 top-2 flex gap-2">
                {photo.isGifted ? (
                  <div className="flex items-center gap-1 rounded-full bg-success/90 px-2 py-1 text-xs font-semibold text-white">
                    <Gift className="h-3 w-3" />
                    Gifted
                  </div>
                ) : (
                  <div className="flex items-center gap-1 rounded-full bg-accent/90 px-2 py-1 text-xs font-semibold text-white">
                    <Lock className="h-3 w-3" />
                    Premium
                  </div>
                )}
              </div>

              <div className="absolute left-2 top-2">
                <div className="rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                  {Math.round(photo.confidence)}% match
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => {
            setSelectedPhoto(null);
          }}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-background"
            onClick={(event) => event.stopPropagation()}
          >
            {selectedPhoto.thumbnailUrl && (
              <img src={selectedPhoto.thumbnailUrl} alt="Drop-in photo" className="max-h-[70vh] w-full object-contain" />
            )}

            <div className="space-y-4 p-6">
              <div className="flex items-start justify-between">
                <div>
                  {selectedPhoto.uploader && (
                    <div className="mb-2 flex items-center gap-2">
                      {selectedPhoto.uploader.profile_photo_url ? (
                        <img
                          src={selectedPhoto.uploader.profile_photo_url}
                          alt={selectedPhoto.uploader.display_name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <User className="h-4 w-4 text-secondary" />
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{selectedPhoto.uploader.display_name}</p>
                        <p className="text-sm text-secondary">{selectedPhoto.uploader.face_tag}</p>
                      </div>
                    </div>
                  )}
                  {selectedPhoto.locationName && (
                    <div className="flex items-center gap-2 text-sm text-secondary">
                      <MapPin className="h-4 w-4" />
                      {selectedPhoto.locationName}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-sm text-secondary">
                    <Calendar className="h-4 w-4" />
                    {new Date(selectedPhoto.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-secondary">Match Confidence</div>
                  <div className="text-2xl font-bold text-accent">{Math.round(selectedPhoto.confidence)}%</div>
                </div>
              </div>

              {selectedPhoto.giftMessage && (
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-accent" />
                    <span className="font-semibold text-foreground">Sender Message</span>
                  </div>
                  <p className="text-foreground">{selectedPhoto.giftMessage}</p>
                </div>
              )}

              <div className="flex gap-4 border-t border-border pt-4">
                <Button
                  onClick={() => {
                    setSelectedPhoto(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  onClick={async () => {
                    if (!selectedPhoto.photoId) return;

                    try {
                      const response = await fetch('/api/vault', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          dropInPhotoId: selectedPhoto.photoId,
                          isFavorite: false,
                        }),
                      });

                      const data = await response.json();
                      if (!response.ok) {
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

              {selectedPhoto.notificationId && (
                <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
                  <Button
                    onClick={() => handleConnectionDecision('accept_connection')}
                    disabled={decisionLoading !== null || selectedPhoto.connectionDecision === 'accepted_connection'}
                    className="w-full"
                  >
                    {decisionLoading === 'accept_connection' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {selectedPhoto.connectionDecision === 'accepted_connection'
                      ? 'Connection Accepted'
                      : 'Accept Connection'}
                  </Button>
                  <Button
                    onClick={() => handleConnectionDecision('decline_connection')}
                    disabled={decisionLoading !== null || selectedPhoto.connectionDecision === 'declined_connection'}
                    variant="outline"
                    className="w-full"
                  >
                    {decisionLoading === 'decline_connection' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {selectedPhoto.connectionDecision === 'declined_connection'
                      ? 'Connection Declined'
                      : 'Decline Connection'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
