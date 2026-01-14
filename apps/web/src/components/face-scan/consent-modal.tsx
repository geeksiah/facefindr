'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Shield,
  Lock,
  Eye,
  Trash2,
  CheckCircle2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ConsentModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  eventName?: string;
}

export function ConsentModal({
  isOpen,
  onAccept,
  onDecline,
  eventName,
}: ConsentModalProps) {
  const [hasRead, setHasRead] = useState(false);

  if (!isOpen) return null;

  return (
    <div 
      className="z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: '1rem',
      }}
    >
      <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Biometric Consent</h2>
              <p className="text-sm text-secondary">Required for face matching</p>
            </div>
          </div>
          <button
            onClick={onDecline}
            className="flex h-10 w-10 items-center justify-center rounded-full text-secondary hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Event Context */}
        {eventName && (
          <div className="mb-6 rounded-xl bg-muted/50 p-4">
            <p className="text-sm text-secondary">
              You&apos;re about to scan your face to find photos from:
            </p>
            <p className="font-semibold text-foreground mt-1">{eventName}</p>
          </div>
        )}

        {/* Consent Points */}
        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
            <Lock className="h-5 w-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Secure Processing</p>
              <p className="text-sm text-secondary">
                Your face data is encrypted and processed using AWS Rekognition with industry-standard security.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
            <Eye className="h-5 w-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Limited Use</p>
              <p className="text-sm text-secondary">
                Your face data is only used to match you in event photos. We never sell or share it with third parties.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
            <Trash2 className="h-5 w-5 text-accent mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Delete Anytime</p>
              <p className="text-sm text-secondary">
                You can delete your face data at any time from your profile settings. No questions asked.
              </p>
            </div>
          </div>
        </div>

        {/* Consent Checkbox */}
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <button
            type="button"
            onClick={() => setHasRead(!hasRead)}
            className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
              hasRead
                ? 'border-accent bg-accent'
                : 'border-border hover:border-secondary'
            }`}
          >
            {hasRead && <CheckCircle2 className="h-4 w-4 text-white" />}
          </button>
          <span className="text-sm text-secondary">
            I have read and agree to the{' '}
            <Link
              href="/privacy#biometric"
              className="text-accent hover:underline"
              target="_blank"
            >
              Biometric Data Policy
            </Link>{' '}
            and consent to the collection and processing of my face data for photo matching purposes.
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onDecline}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={onAccept}
            disabled={!hasRead}
          >
            I Agree & Continue
          </Button>
        </div>

        {/* Privacy Link */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Learn more about how we protect your data in our{' '}
          <Link href="/privacy" className="text-accent hover:underline" target="_blank">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
