'use client';

import { Shield, ShieldCheck, ShieldX, Loader2, Camera } from 'lucide-react';
import { useState, useCallback } from 'react';

import { Button } from '@/components/ui/button';

import { GuidedFaceScanner } from './guided-face-scanner';

interface LivenessVerifiedScannerProps {
  onComplete: (images: string[], livenessVerified: boolean) => Promise<void>;
  onCancel?: () => void;
  requireLiveness?: boolean;
}

type ScanStep = 'capture' | 'verifying' | 'complete' | 'error';

interface LivenessResult {
  isLive: boolean;
  confidence: number;
  mode: 'session' | 'multi-angle';
}

export function LivenessVerifiedScanner({
  onComplete,
  onCancel,
  requireLiveness = true,
}: LivenessVerifiedScannerProps) {
  const [step, setStep] = useState<ScanStep>('capture');
  const [livenessResult, setLivenessResult] = useState<LivenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);

  const verifyLiveness = useCallback(async (images: string[]): Promise<LivenessResult | null> => {
    try {
      // Strip data URL prefix to get just base64
      const base64Images = images.map(img => {
        const base64Match = img.match(/base64,(.+)/);
        return base64Match ? base64Match[1] : img;
      });

      const response = await fetch('/api/faces/liveness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'multi-angle',
          images: base64Images,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Liveness verification failed');
      }

      return await response.json();
    } catch (err) {
      console.error('Liveness verification error:', err);
      throw err;
    }
  }, []);

  const handleCaptures = useCallback(async (images: string[]) => {
    setCapturedImages(images);
    setStep('verifying');
    setError(null);

    try {
      const result = await verifyLiveness(images);
      setLivenessResult(result);

      if (result?.isLive) {
        setStep('complete');
        await onComplete(images, true);
      } else if (requireLiveness) {
        setError('Liveness check failed. Please ensure you are in good lighting and try again.');
        setStep('error');
      } else {
        // Allow to continue even if liveness failed (with warning)
        setStep('complete');
        await onComplete(images, false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify liveness');
      setStep('error');
    }
  }, [verifyLiveness, onComplete, requireLiveness]);

  const handleRetry = () => {
    setStep('capture');
    setLivenessResult(null);
    setError(null);
    setCapturedImages([]);
  };

  const handleContinueWithoutLiveness = async () => {
    setStep('complete');
    await onComplete(capturedImages, false);
  };

  // Show capture step
  if (step === 'capture') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
          <Shield className="h-5 w-5 text-accent" />
          <span>
            Liveness verification protects your account from unauthorized access
          </span>
        </div>
        <GuidedFaceScanner
          onComplete={handleCaptures}
          onCancel={onCancel}
        />
      </div>
    );
  }

  // Verifying step
  if (step === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="relative">
          <Shield className="h-16 w-16 text-accent animate-pulse" />
          <Loader2 className="absolute -bottom-2 -right-2 h-6 w-6 text-accent animate-spin" />
        </div>
        <h3 className="text-lg font-semibold">Verifying Liveness</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Analyzing your face scan to ensure it's really you...
        </p>
        <div className="flex gap-2 mt-4">
          {capturedImages.slice(0, 3).map((_, i) => (
            <div
              key={i}
              className="h-3 w-3 rounded-full bg-accent animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Error step
  if (step === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="rounded-full bg-destructive/10 p-4">
          <ShieldX className="h-12 w-12 text-destructive" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-destructive">
            Liveness Check Failed
          </h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            {error || 'We could not verify that this is a live scan. Please try again.'}
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 max-w-sm">
          <h4 className="font-medium text-sm mb-2">Tips for a successful scan:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Ensure your face is well-lit</li>
            <li>• Remove sunglasses or hats</li>
            <li>• Follow the head turn prompts carefully</li>
            <li>• Make sure you're using the front camera</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Button variant="primary" onClick={handleRetry}>
            <Camera className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          {!requireLiveness && (
            <Button variant="outline" onClick={handleContinueWithoutLiveness}>
              Continue Anyway
            </Button>
          )}
        </div>

        {livenessResult && (
          <p className="text-xs text-muted-foreground">
            Confidence: {livenessResult.confidence.toFixed(0)}%
          </p>
        )}
      </div>
    );
  }

  // Complete step (success)
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="rounded-full bg-success/10 p-4">
        <ShieldCheck className="h-12 w-12 text-success" />
      </div>
      <h3 className="text-lg font-semibold text-success">
        Liveness Verified
      </h3>
      <p className="text-muted-foreground text-center max-w-sm">
        Your face scan has been verified and is being processed.
      </p>
      {livenessResult && (
        <p className="text-xs text-muted-foreground">
          Confidence: {livenessResult.confidence.toFixed(0)}%
        </p>
      )}
    </div>
  );
}
