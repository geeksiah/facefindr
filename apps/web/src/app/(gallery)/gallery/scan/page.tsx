'use client';

import {
  ArrowLeft,
  Shield,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback, useEffect } from 'react';

import { GuidedFaceScanner, ConsentModal } from '@/components/face-scan';
import { Button } from '@/components/ui/button';

type ScanStage = 'intro' | 'consent' | 'scan' | 'processing';

export default function FaceScanPage() {
  const [stage, setStage] = useState<ScanStage>('intro');
  const [hasFaceProfile, setHasFaceProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadFaceProfileStatus = async () => {
      try {
        const response = await fetch('/api/attendee/face-profile');
        const payload = await response.json().catch(() => ({}));
        setHasFaceProfile(Boolean(payload?.hasFaceProfile));
      } catch {
        setHasFaceProfile(false);
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

  const handleGuidedScanComplete = useCallback(async (captures: string[]) => {
    setError(null);
    setSuccessMessage(null);
    setStage('processing');

    try {
      const images = captures.map((capture) => capture.split(',')[1]).filter(Boolean);
      if (!images.length) {
        throw new Error('No captures were provided.');
      }

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
      setSuccessMessage(
        hasFaceProfile
          ? 'Face profile updated. Use event scan or Drop-In/Find Me to search photos.'
          : 'Face profile saved. Use event scan or Drop-In/Find Me to search photos.'
      );
      setStage('intro');
    } catch (err) {
      console.error('Guided scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process scan');
      setStage('scan');
    }
  }, [hasFaceProfile]);

  return (
    <div className="mx-auto max-w-2xl">
      {stage !== 'intro' && (
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
              <h1 className="text-xl font-bold text-foreground">Set Up Face Profile</h1>
              <p className="text-sm text-secondary mt-1 max-w-xs mx-auto">
                {hasFaceProfile
                  ? 'Refresh your saved profile with a guided 5-angle scan.'
                  : 'Create your face profile with a guided 5-angle scan.'}
              </p>
            </div>
          </div>

          {successMessage && (
            <div className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
              {successMessage}
            </div>
          )}

          <div className="mt-4 space-y-2">
            {[
              {
                label: 'Multi-angle capture for stronger face profile quality',
                icon: Check,
              },
              {
                label: 'Use Event Scan or Drop-In/Find Me when you want to search photos',
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
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setStage('consent');
              }}
              className="w-full h-14 text-base"
            >
              {isLoadingProfile
                ? 'Loading...'
                : hasFaceProfile
                ? 'Update 5-Angle Face Profile'
                : 'Start 5-Angle Scan'}
              <ChevronRight className="h-5 w-5" />
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              ~30 seconds, 5 captures
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
            <GuidedFaceScanner
              onComplete={handleGuidedScanComplete}
              onCancel={() => setStage('intro')}
            />
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
            Saving your face profile...
          </p>
        </div>
      )}
    </div>
  );
}
