'use client';

import {
  ArrowLeft,
  Shield,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';

import { FaceScanner, GuidedFaceScanner, ConsentModal, MatchResults } from '@/components/face-scan';
import { Button } from '@/components/ui/button';

type ScanStage = 'intro' | 'consent' | 'scan' | 'processing' | 'results';
type ScanMode = 'selfie_search' | 'profile_setup';

interface EventMatch {
  eventId: string;
  eventName: string;
  eventDate?: string;
  eventLocation?: string;
  coverImage?: string;
  photos: Array<{
    mediaId: string;
    thumbnailUrl: string;
    similarity: number;
    isPurchased?: boolean;
  }>;
}

export default function FaceScanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<ScanStage>('intro');
  const [scanMode, setScanMode] = useState<ScanMode>('profile_setup');
  const [hasFaceProfile, setHasFaceProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [matches, setMatches] = useState<EventMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFaceProfileStatus = async () => {
      try {
        const response = await fetch('/api/attendee/face-profile');
        const payload = await response.json().catch(() => ({}));
        const hasProfile = Boolean(payload?.hasFaceProfile);
        setHasFaceProfile(hasProfile);
        setScanMode(hasProfile ? 'selfie_search' : 'profile_setup');
      } catch {
        setHasFaceProfile(false);
        setScanMode('profile_setup');
      } finally {
        setIsLoadingProfile(false);
      }
    };
    void loadFaceProfileStatus();
  }, []);

  const handleConsentAccept = () => {
    setStage('scan');
  };

  const handleConsentDecline = () => {
    setStage('intro');
  };

  const runFaceSearch = useCallback(async (imageBase64: string) => {
    const searchResponse = await fetch('/api/faces/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!searchResponse.ok) {
      const result = await searchResponse.json().catch(() => ({}));
      throw new Error(result.error || 'Failed to search for matches');
    }

    const searchResult = await searchResponse.json();
    const groupedMatches = searchResult.groupedMatches || {};
    const eventMatches: EventMatch[] = Object.entries(groupedMatches).map(
      ([eventId, photos]) => ({
        eventId,
        eventName: (photos as any[])[0]?.eventName || 'Unknown Event',
        eventDate: (photos as any[])[0]?.eventDate || undefined,
        eventLocation: (photos as any[])[0]?.eventLocation || undefined,
        photos: (photos as any[]).map((p) => ({
          mediaId: p.mediaId || p.id,
          thumbnailUrl: p.thumbnailUrl || p.thumbnail_path,
          similarity: Number(p.similarity || 0),
        })),
      })
    );

    setMatches(eventMatches);
    setTotalMatches(searchResult.totalMatches || 0);
    setStage('results');
  }, []);

  const handleGuidedScanComplete = useCallback(async (captures: string[]) => {
    setError(null);
    setStage('processing');

    try {
      const images = captures.map((capture) => capture.split(',')[1]).filter(Boolean);
      if (!images.length) {
        throw new Error('No captures were provided.');
      }

      const shouldSetupOrRefreshProfile = scanMode === 'profile_setup';
      if (shouldSetupOrRefreshProfile) {
        const registerResponse = await fetch('/api/faces/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            primaryImage: images[0],
          }),
        });

        if (!registerResponse.ok) {
          const result = await registerResponse.json().catch(() => ({}));
          throw new Error(result.error || 'Failed to register face profile');
        }

        setHasFaceProfile(true);
        setScanMode('selfie_search');
      }

      await runFaceSearch(images[0]);
    } catch (err) {
      console.error('Guided scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process scan');
      setStage('scan');
    }
  }, [runFaceSearch, scanMode]);

  const handleSelfieCapture = useCallback(async (imageData: string) => {
    setError(null);
    setStage('processing');

    try {
      const imageBase64 = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
      await runFaceSearch(imageBase64);
    } catch (err) {
      console.error('Selfie search error:', err);
      const message = err instanceof Error ? err.message : 'Failed to process selfie';
      setError(message);
      setStage('scan');
      throw err;
    }
  }, [runFaceSearch]);

  const handleViewEvent = (eventId: string) => {
    router.push(`/gallery/events/${eventId}`);
  };

  const handlePurchase = (mediaIds: string[], eventId: string) => {
    const params = new URLSearchParams({
      eventId,
      photos: mediaIds.join(','),
    });
    router.push(`/gallery/checkout?${params.toString()}`);
  };

  const resetScan = () => {
    setStage('intro');
    setMatches([]);
    setTotalMatches(0);
    setError(null);
    setScanMode(hasFaceProfile ? 'selfie_search' : 'profile_setup');
  };

  return (
    <div className="mx-auto max-w-2xl">
      {stage !== 'intro' && stage !== 'results' && (
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 text-sm text-secondary hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Gallery
        </Link>
      )}

      {stage === 'intro' && (
        <div className="flex flex-col min-h-[calc(100vh-12rem)] lg:min-h-0">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/20 p-6 text-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-3">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Find Your Photos</h1>
              <p className="text-sm text-secondary mt-1 max-w-xs mx-auto">
                {hasFaceProfile
                  ? 'Your face profile is active. Use one selfie to find new photos.'
                  : 'Set up your face profile with a 5-angle scan for best accuracy.'}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {[
              {
                label: hasFaceProfile
                  ? 'Single-selfie search for faster event matching'
                  : 'Multi-angle capture for stronger face profile quality',
                icon: Check,
              },
              {
                label: hasFaceProfile
                  ? 'Optional 5-angle refresh if your appearance changes'
                  : 'Auto-capture when your head position matches',
                icon: Check,
              },
              { label: 'Encrypted and deletable anytime', icon: Shield },
            ].map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10">
                  <item.icon className="h-3.5 w-3.5 text-success" />
                </div>
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-4" />

          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="primary"
              size="lg"
              disabled={isLoadingProfile}
              onClick={() => setStage('consent')}
              className="w-full h-14 text-base"
            >
              {isLoadingProfile
                ? 'Loading...'
                : scanMode === 'profile_setup'
                ? 'Start 5-Angle Scan'
                : 'Take Selfie to Search'}
              <ChevronRight className="h-5 w-5" />
            </Button>
            {hasFaceProfile && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2"
                onClick={() =>
                  setScanMode((current) =>
                    current === 'profile_setup' ? 'selfie_search' : 'profile_setup'
                  )
                }
              >
                {scanMode === 'profile_setup'
                  ? 'Use quick selfie search instead'
                  : 'Update face profile with 5-angle scan'}
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground mt-3">
              {scanMode === 'profile_setup'
                ? '~30 seconds, 5 captures'
                : '~10 seconds, 1 selfie capture'}
            </p>
          </div>
        </div>
      )}

      <ConsentModal
        isOpen={stage === 'consent'}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

      {stage === 'scan' && (
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            {scanMode === 'profile_setup' ? (
              <GuidedFaceScanner
                onComplete={handleGuidedScanComplete}
                onCancel={() => setStage('intro')}
              />
            ) : (
              <FaceScanner
                onCapture={handleSelfieCapture}
                onCancel={() => setStage('intro')}
              />
            )}
          </div>
        </div>
      )}

      {stage === 'processing' && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-muted" />
            <div className="absolute inset-0 rounded-full border-4 border-t-accent animate-spin" />
          </div>
          <h2 className="mt-6 text-lg font-semibold text-foreground">Processing</h2>
          <p className="mt-1 text-sm text-secondary">
            {scanMode === 'profile_setup'
              ? 'Updating your face profile and finding matches...'
              : 'Finding your matches...'}
          </p>
        </div>
      )}

      {stage === 'results' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 text-sm text-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Gallery
            </Link>
            <Button variant="secondary" size="sm" onClick={resetScan}>
              Scan Again
            </Button>
          </div>

          <MatchResults
            matches={matches}
            totalMatches={totalMatches}
            onViewEvent={handleViewEvent}
            onPurchase={handlePurchase}
          />
        </div>
      )}
    </div>
  );
}
