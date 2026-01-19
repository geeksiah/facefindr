'use client';

import {
  Camera,
  Upload,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useState, useRef } from 'react';

import { Button } from '@/components/ui/button';

import { ConsentModal } from './consent-modal';

interface QuickScanWidgetProps {
  eventId: string;
  eventName: string;
  onMatchesFound: (matches: Array<{
    mediaId: string;
    thumbnailUrl: string;
    similarity: number;
  }>) => void;
}

export function QuickScanWidget({
  eventId,
  eventName,
  onMatchesFound,
}: QuickScanWidgetProps) {
  const [showConsent, setShowConsent] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      setShowConsent(true);
    };
    reader.readAsDataURL(file);
  };

  const handleConsentAccept = async () => {
    setShowConsent(false);
    
    if (!capturedImage) return;

    setIsProcessing(true);
    setError(null);

    try {
      const base64Data = capturedImage.split(',')[1];

      const response = await fetch('/api/faces/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          eventId,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to search');
      }

      const result = await response.json();
      onMatchesFound(result.matches || []);
    } catch (err) {
      console.error('Quick scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to find photos');
    } finally {
      setIsProcessing(false);
      setCapturedImage(null);
    }
  };

  const handleConsentDecline = () => {
    setShowConsent(false);
    setCapturedImage(null);
  };

  return (
    <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
          <Sparkles className="h-6 w-6 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Find your photos</h3>
          <p className="text-sm text-secondary mt-1">
            Upload a selfie to instantly find all photos of you in this event
          </p>

          {error && (
            <div className="flex items-center gap-2 mt-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-sm text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Finding your photos...</span>
              </div>
            ) : (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Photo
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <ConsentModal
        isOpen={showConsent}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        eventName={eventName}
      />

      {/* Preview of captured image while processing */}
      {isProcessing && capturedImage && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-lg">
            <Image
              src={capturedImage}
              alt="Your photo"
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="text-sm text-secondary">Analyzing face...</div>
        </div>
      )}
    </div>
  );
}
