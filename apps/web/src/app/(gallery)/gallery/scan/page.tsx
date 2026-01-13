'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Shield,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { GuidedFaceScanner, ConsentModal, MatchResults } from '@/components/face-scan';

type ScanStage = 'intro' | 'consent' | 'scan' | 'processing' | 'results';

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
  const [matches, setMatches] = useState<EventMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleConsentAccept = () => {
    setStage('scan');
  };

  const handleConsentDecline = () => {
    setStage('intro');
  };

  const handleScanComplete = useCallback(async (captures: string[]) => {
    setError(null);
    setStage('processing');

    try {
      const images = captures.map((capture) => capture.split(',')[1]);

      const registerResponse = await fetch('/api/faces/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images,
          primaryImage: images[0],
        }),
      });

      if (!registerResponse.ok) {
        const result = await registerResponse.json();
        throw new Error(result.error || 'Failed to register face');
      }

      const searchResponse = await fetch('/api/faces/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: images[0] }),
      });

      if (!searchResponse.ok) {
        const result = await searchResponse.json();
        throw new Error(result.error || 'Failed to search for matches');
      }

      const searchResult = await searchResponse.json();

      const groupedMatches = searchResult.groupedMatches || {};
      const eventMatches: EventMatch[] = Object.entries(groupedMatches).map(
        ([eventId, photos]) => ({
          eventId,
          eventName: (photos as any[])[0]?.eventName || 'Unknown Event',
          photos: (photos as any[]).map((p) => ({
            mediaId: p.mediaId,
            thumbnailUrl: p.thumbnailUrl,
            similarity: p.similarity,
          })),
        })
      );

      setMatches(eventMatches);
      setTotalMatches(searchResult.totalMatches || 0);
      setStage('results');
    } catch (err) {
      console.error('Scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process scan');
      setStage('scan');
    }
  }, []);

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
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back Button - Not on intro */}
      {stage !== 'intro' && stage !== 'results' && (
        <Link
          href="/gallery"
          className="inline-flex items-center gap-2 text-sm text-secondary hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Gallery
        </Link>
      )}

      {/* Intro Stage - Compact, CTA-focused */}
      {stage === 'intro' && (
        <div className="flex flex-col min-h-[calc(100vh-12rem)] lg:min-h-0">
          {/* Hero - Compact */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/10 via-accent/5 to-transparent border border-accent/20 p-6 text-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-3">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Find Your Photos</h1>
              <p className="text-sm text-secondary mt-1 max-w-xs mx-auto">
                5-angle face scan for the most accurate photo matching
              </p>
            </div>
          </div>

          {/* Features - Inline compact list */}
          <div className="mt-4 space-y-2">
            {[
              { label: 'Multi-angle capture for accuracy', icon: Check },
              { label: 'Auto-capture when position matches', icon: Check },
              { label: 'Encrypted & deletable anytime', icon: Shield },
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

          {/* Spacer for mobile to push CTA down but keep it visible */}
          <div className="flex-1 min-h-4" />

          {/* CTA Section - Always visible */}
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setStage('consent')}
              className="w-full h-14 text-base"
            >
              Start Face Scan
              <ChevronRight className="h-5 w-5" />
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              ~30 seconds · Camera required
            </p>
          </div>
        </div>
      )}

      {/* Consent Modal */}
      <ConsentModal
        isOpen={stage === 'consent'}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
      />

      {/* Scan Stage */}
      {stage === 'scan' && (
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            <GuidedFaceScanner
              onComplete={handleScanComplete}
              onCancel={() => setStage('intro')}
            />
          </div>
        </div>
      )}

      {/* Processing Stage */}
      {stage === 'processing' && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-muted" />
            <div className="absolute inset-0 rounded-full border-4 border-t-accent animate-spin" />
          </div>
          <h2 className="mt-6 text-lg font-semibold text-foreground">Processing</h2>
          <p className="mt-1 text-sm text-secondary">
            Registering your face and finding matches...
          </p>
        </div>
      )}

      {/* Results Stage */}
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
