'use client';

import { CheckCircle, Loader2, XCircle, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

interface PurchaseDetails {
  eventId: string;
  eventName: string;
  photoCount: number;
  totalAmount: number;
  currency: string;
  isUnlockAll: boolean;
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [details, setDetails] = useState<PurchaseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyPurchase = async () => {
      try {
        // Get provider and session info from URL
        const provider = searchParams?.get('provider') || 'stripe';
        const sessionId = searchParams?.get('session_id');
        const txRef = searchParams?.get('tx_ref');
        const orderId = searchParams?.get('order_id');

        let verifyUrl = '/api/checkout/verify?';
        if (sessionId) verifyUrl += `session_id=${sessionId}`;
        else if (txRef) verifyUrl += `tx_ref=${txRef}&provider=${provider}`;
        else if (orderId) verifyUrl += `order_id=${orderId}&provider=${provider}`;

        const response = await fetch(verifyUrl);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to verify purchase');
        }

        setDetails(data);
        setStatus('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed');
        setStatus('error');
      }
    };

    verifyPurchase();
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-accent mb-4" />
        <h1 className="text-xl font-semibold text-foreground">Verifying your purchase...</h1>
        <p className="text-secondary mt-2">Please wait while we confirm your payment</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <XCircle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Payment verification failed</h1>
        <p className="text-secondary mt-2 max-w-md">{error}</p>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={() => router.back()}>
            Go Back
          </Button>
          <Button variant="primary" asChild>
            <Link href="/gallery">My Photos</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl bg-card border border-border p-8 text-center">
        <div className="rounded-full bg-success/10 p-4 inline-block mb-4">
          <CheckCircle className="h-12 w-12 text-success" />
        </div>

        <h1 className="text-2xl font-bold text-foreground">Purchase Complete</h1>
        <p className="text-secondary mt-2">Thank you for your purchase!</p>

        {details && (
          <div className="mt-6 pt-6 border-t border-border text-left">
            <h2 className="font-semibold text-foreground mb-4">Order Details</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary">Event</span>
                <span className="text-foreground">{details.eventName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Photos</span>
                <span className="text-foreground">
                  {details.isUnlockAll ? 'All photos unlocked' : `${details.photoCount} photo${details.photoCount !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Total</span>
                <span className="text-foreground font-semibold">
                  {details.currency} {(details.totalAmount / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <Button variant="primary" className="w-full" asChild>
            <Link href={details ? `/gallery/events/${details.eventId}` : '/gallery'}>
              <Download className="h-4 w-4 mr-2" />
              Download Photos
            </Link>
          </Button>
          <Button variant="secondary" className="w-full" asChild>
            <Link href="/gallery">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Photos
            </Link>
          </Button>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        A receipt has been sent to your email address.
      </p>
    </div>
  );
}

