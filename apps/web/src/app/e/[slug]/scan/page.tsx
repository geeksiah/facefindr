'use client';

import {
  ArrowLeft,
  Camera,
  Scan,
  ShoppingCart,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { FaceScanner } from '@/components/face-scan/face-scanner';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { useConfirm } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface MatchedPhoto {
  id: string;
  thumbnail_path: string;
  storage_path: string;
  similarity: number;
  price?: number;
  currency?: string;
}

function normalizeMatches(rawMatches: any[]): MatchedPhoto[] {
  const unique = new Map<string, MatchedPhoto>();

  for (const raw of rawMatches || []) {
    const id = raw?.id || raw?.mediaId;
    if (!id) continue;

    const similarity = Number(raw?.similarity || 0);
    const existing = unique.get(id);
    if (existing && existing.similarity >= similarity) {
      continue;
    }

    unique.set(id, {
      id,
      thumbnail_path: raw?.thumbnail_path || raw?.thumbnailUrl || raw?.url || '',
      storage_path: raw?.storage_path || raw?.url || raw?.thumbnailUrl || '',
      similarity,
      price: typeof raw?.price === 'number' ? raw.price : undefined,
      currency: raw?.currency || undefined,
    });
  }

  return Array.from(unique.values()).sort((a, b) => b.similarity - a.similarity);
}

export default function PublicEventScanPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const code = searchParams?.get('code');

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [matchedPhotos, setMatchedPhotos] = useState<MatchedPhoto[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [viewingPhoto, setViewingPhoto] = useState<MatchedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const handleBack = async () => {
    if (selectedPhotos.size > 0) {
      const confirmed = await confirm({
        title: 'Leave Page?',
        message: `You have ${selectedPhotos.size} photo${selectedPhotos.size !== 1 ? 's' : ''} selected. Are you sure you want to leave? Your selection will be lost.`,
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
        variant: 'destructive',
      });
      if (!confirmed) return;
    }
    router.push(`/e/${slug}${code ? `?code=${code}` : ''}`);
  };

  useEffect(() => {
    void loadEvent();
  }, [slug]);

  async function hydrateExistingMatches(eventId: string) {
    try {
      const response = await fetch(`/api/events/${eventId}/attendee-view`);
      if (!response.ok) return;
      const payload = await response.json();
      const normalized = normalizeMatches(payload?.matchedPhotos || []);
      if (normalized.length > 0) {
        setMatchedPhotos(normalized);
      }
    } catch {
      // Non-fatal: attendee might be unauthenticated in this context.
    }
  }

  async function loadEvent() {
    try {
      const res = await fetch(`/api/events/public/${slug}${code ? `?code=${code}` : ''}`);
      const data = await res.json();

      if (res.ok) {
        setEvent(data.event);
        if (data?.event?.id) {
          await hydrateExistingMatches(data.event.id);
        }
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load event');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelfieCapture(imageData: string) {
    if (!event?.id) {
      throw new Error('Event not loaded');
    }

    setScanning(true);
    setShowScanner(false);
    setError(null);

    try {
      const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
      const res = await fetch('/api/faces/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, eventId: event.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Face search failed');
      }

      setMatchedPhotos(normalizeMatches(data.matches || []));
    } catch (err: any) {
      setError(err.message || 'Failed to find matching photos');
      throw err;
    } finally {
      setScanning(false);
    }
  }

  function togglePhotoSelection(photoId: string) {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);
  }

  function selectAll() {
    if (selectedPhotos.size === matchedPhotos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(matchedPhotos.map((p) => p.id)));
    }
  }

  function handleAddToCart() {
    const photoIds = Array.from(selectedPhotos).join(',');
    router.push(`/gallery/checkout?event=${event.id}&photos=${photoIds}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-foreground mb-2">Unable to Load</h1>
          <p className="text-secondary mb-6">{error}</p>
          <Link href={`/e/${slug}${code ? `?code=${code}` : ''}`}>
            <Button variant="outline">Go Back</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (showScanner) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <FaceScanner
            onCapture={handleSelfieCapture}
            onCancel={() => setShowScanner(false)}
            isProcessing={scanning}
            processingText="Finding your photos..."
          />
        </div>
      </div>
    );
  }

  if (viewingPhoto) {
    const currentIndex = matchedPhotos.findIndex((p) => p.id === viewingPhoto.id);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < matchedPhotos.length - 1;

    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col" style={{ margin: 0, padding: 0 }}>
        <div className="flex items-center justify-between p-4 text-white">
          <button onClick={() => setViewingPhoto(null)}>
            <X className="h-6 w-6" />
          </button>
          <span className="text-sm">
            {currentIndex + 1} / {matchedPhotos.length}
          </span>
          <button
            onClick={() => togglePhotoSelection(viewingPhoto.id)}
            className={cn(
              'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
              selectedPhotos.has(viewingPhoto.id) ? 'bg-accent border-accent' : 'border-white/50'
            )}
          >
            {selectedPhotos.has(viewingPhoto.id) && <Check className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 relative">
          <Image src={viewingPhoto.storage_path} alt="Photo" fill className="object-contain" />

          {hasPrev && (
            <button
              onClick={() => setViewingPhoto(matchedPhotos[currentIndex - 1])}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => setViewingPhoto(matchedPhotos[currentIndex + 1])}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="p-4 flex items-center justify-center gap-4 text-white">
          {viewingPhoto.price && (
            <span className="text-lg font-semibold">
              {viewingPhoto.currency || '$'}{viewingPhoto.price.toFixed(2)}
            </span>
          )}
          <Button
            onClick={() => togglePhotoSelection(viewingPhoto.id)}
            variant={selectedPhotos.has(viewingPhoto.id) ? 'default' : 'outline'}
          >
            {selectedPhotos.has(viewingPhoto.id) ? 'Selected' : 'Select Photo'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-foreground truncate">{event?.name}</h1>
            <p className="text-sm text-secondary">Find your photos</p>
          </div>
          <Link href="/">
            <Logo variant="icon" className="h-8 w-8" />
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {!scanning && matchedPhotos.length === 0 && (
          <div className="max-w-md mx-auto text-center py-8">
            <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Scan className="w-12 h-12 text-accent" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Find Your Photos</h2>
            <p className="text-secondary mb-8">
              Your saved matches are loaded automatically when available. Take one selfie to refresh and find newly uploaded photos.
            </p>

            <Button size="lg" onClick={() => setShowScanner(true)} className="w-full max-w-xs mx-auto">
              <Camera className="h-5 w-5 mr-2" />
              Take Selfie
            </Button>

            {error && <p className="mt-4 text-destructive text-sm">{error}</p>}
          </div>
        )}

        {scanning && (
          <div className="max-w-md mx-auto text-center py-16">
            <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Finding Your Photos...</h2>
            <p className="text-secondary">Our AI is searching event photos for your face</p>
          </div>
        )}

        {!scanning && matchedPhotos.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Found {matchedPhotos.length} photo{matchedPhotos.length !== 1 ? 's' : ''} of you
                </h2>
                <p className="text-sm text-secondary">{selectedPhotos.size} selected</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {selectedPhotos.size === matchedPhotos.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowScanner(true)}>
                  <Scan className="h-4 w-4 mr-1" />
                  Selfie Again
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
              {matchedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-xl overflow-hidden bg-muted group cursor-pointer"
                  onClick={() => setViewingPhoto(photo)}
                >
                  <Image
                    src={photo.thumbnail_path}
                    alt="Matched photo"
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className={cn(
                      'absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all',
                      selectedPhotos.has(photo.id)
                        ? 'bg-accent border-accent scale-100'
                        : 'border-white bg-black/30 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100'
                    )}
                  >
                    {selectedPhotos.has(photo.id) && <Check className="h-4 w-4 text-white" />}
                  </button>

                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded-lg text-xs text-white">
                    {Math.round(photo.similarity)}% match
                  </div>

                  {photo.price && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-accent rounded-lg text-xs text-white font-medium">
                      {photo.currency || '$'}{photo.price.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedPhotos.size > 0 && (
              <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto z-40">
                <Button size="lg" onClick={handleAddToCart} className="w-full sm:w-auto shadow-lg">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Add {selectedPhotos.size} to Cart
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmDialog />
    </div>
  );
}
