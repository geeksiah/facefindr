'use client';

import {
  ArrowLeft,
  Camera,
  Scan,
  ShoppingCart,
  Download,
  Heart,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import { GuidedFaceScanner } from '@/components/face-scan/guided-face-scanner';
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

  // Handle back navigation with confirmation
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
    loadEvent();
  }, [slug]);

  async function loadEvent() {
    try {
      const res = await fetch(`/api/events/public/${slug}${code ? `?code=${code}` : ''}`);
      const data = await res.json();
      
      if (res.ok) {
        setEvent(data.event);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load event');
    } finally {
      setLoading(false);
    }
  }

  // Convert base64 data URL to Blob
  function dataURLtoBlob(dataURL: string): Blob {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  async function handleScanComplete(images: string[]) {
    setScanning(true);
    setShowScanner(false);
    setError(null);

    try {
      // Create form data with captured images
      // Convert base64 data URLs to Blobs
      const formData = new FormData();
      formData.append('eventId', event.id);
      images.forEach((imgDataUrl, i) => {
        const blob = dataURLtoBlob(imgDataUrl);
        formData.append(`image_${i}`, blob, `face_${i}.jpg`);
      });

      const res = await fetch('/api/faces/search', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Face search failed');
      }

      setMatchedPhotos(data.matches || []);
    } catch (err: any) {
      setError(err.message || 'Failed to find matching photos');
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
      setSelectedPhotos(new Set(matchedPhotos.map(p => p.id)));
    }
  }

  function handleAddToCart() {
    // Navigate to checkout with selected photos
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

  // Scanner view
  if (showScanner) {
    return (
      <div className="min-h-screen bg-black">
        <GuidedFaceScanner
          onComplete={handleScanComplete}
          onCancel={() => setShowScanner(false)}
        />
      </div>
    );
  }

  // Photo lightbox
  if (viewingPhoto) {
    const currentIndex = matchedPhotos.findIndex(p => p.id === viewingPhoto.id);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < matchedPhotos.length - 1;

    return (
      <div 
        className="fixed inset-0 bg-black z-50 flex flex-col"
        style={{ margin: 0, padding: 0 }}
      >
        {/* Header */}
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
              "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
              selectedPhotos.has(viewingPhoto.id)
                ? "bg-accent border-accent"
                : "border-white/50"
            )}
          >
            {selectedPhotos.has(viewingPhoto.id) && <Check className="h-4 w-4" />}
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 relative">
          <Image
            src={viewingPhoto.storage_path}
            alt="Photo"
            fill
            className="object-contain"
          />
          
          {/* Navigation arrows */}
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

        {/* Footer */}
        <div className="p-4 flex items-center justify-center gap-4 text-white">
          {viewingPhoto.price && (
            <span className="text-lg font-semibold">
              {viewingPhoto.currency || '$'}{viewingPhoto.price.toFixed(2)}
            </span>
          )}
          <Button
            onClick={() => togglePhotoSelection(viewingPhoto.id)}
            variant={selectedPhotos.has(viewingPhoto.id) ? "default" : "outline"}
          >
            {selectedPhotos.has(viewingPhoto.id) ? 'Selected' : 'Select Photo'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
          >
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

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* No matches yet - show scan prompt */}
        {!scanning && matchedPhotos.length === 0 && (
          <div className="max-w-md mx-auto text-center py-8">
            <div className="w-24 h-24 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Scan className="w-12 h-12 text-accent" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Find Your Photos
            </h2>
            <p className="text-secondary mb-8">
              Use your camera to scan your face and we'll instantly find all photos of you from this event.
            </p>

            <Button
              size="lg"
              onClick={() => setShowScanner(true)}
              className="w-full max-w-xs mx-auto"
            >
              <Camera className="h-5 w-5 mr-2" />
              Start Face Scan
            </Button>

            {error && (
              <p className="mt-4 text-destructive text-sm">{error}</p>
            )}

            <div className="mt-12 pt-8 border-t border-border">
              <h3 className="font-medium text-foreground mb-4">How it works</h3>
              <div className="grid gap-4 text-left">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-semibold text-accent">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Scan your face</p>
                    <p className="text-sm text-secondary">Follow the on-screen guide for best results</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-semibold text-accent">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Browse your matches</p>
                    <p className="text-sm text-secondary">AI finds all photos featuring you</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-semibold text-accent">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Purchase & download</p>
                    <p className="text-sm text-secondary">Get high-resolution photos instantly</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scanning */}
        {scanning && (
          <div className="max-w-md mx-auto text-center py-16">
            <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Finding Your Photos...
            </h2>
            <p className="text-secondary">
              Our AI is searching through {event?.photo_count || 'all'} event photos
            </p>
          </div>
        )}

        {/* Match results */}
        {!scanning && matchedPhotos.length > 0 && (
          <>
            {/* Results header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Found {matchedPhotos.length} photo{matchedPhotos.length !== 1 ? 's' : ''} of you
                </h2>
                <p className="text-sm text-secondary">
                  {selectedPhotos.size} selected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {selectedPhotos.size === matchedPhotos.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowScanner(true)}>
                  <Scan className="h-4 w-4 mr-1" />
                  Rescan
                </Button>
              </div>
            </div>

            {/* Photo grid */}
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
                  
                  {/* Selection checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className={cn(
                      "absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedPhotos.has(photo.id)
                        ? "bg-accent border-accent scale-100"
                        : "border-white bg-black/30 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100"
                    )}
                  >
                    {selectedPhotos.has(photo.id) && (
                      <Check className="h-4 w-4 text-white" />
                    )}
                  </button>

                  {/* Match confidence */}
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded-lg text-xs text-white">
                    {Math.round(photo.similarity * 100)}% match
                  </div>

                  {/* Price */}
                  {photo.price && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-accent rounded-lg text-xs text-white font-medium">
                      {photo.currency || '$'}{photo.price.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Floating cart button */}
            {selectedPhotos.size > 0 && (
              <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto z-40">
                <Button
                  size="lg"
                  onClick={handleAddToCart}
                  className="w-full sm:w-auto shadow-lg"
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Add {selectedPhotos.size} to Cart
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
}


