'use client';

/**
 * Drop-In Upload Success Page
 * 
 * Shown after successful payment
 */

import { Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export default function DropInSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    // Verify payment and trigger processing
    if (sessionId) {
      verifyPayment();
    } else {
      setProcessing(false);
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      // Payment is verified via webhook, but we can check status here
      // For now, just wait a moment for webhook to process
      setTimeout(() => {
        setProcessing(false);
      }, 2000);
    } catch (error) {
      console.error('Payment verification error:', error);
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {processing ? (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-accent mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">Processing...</h1>
            <p className="text-secondary">
              We're processing your payment and uploading your photo.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-success/10 p-6 w-24 h-24 mx-auto flex items-center justify-center">
              <Check className="h-12 w-12 text-success" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Upload Successful!</h1>
            <p className="text-secondary">
              Your drop-in photo has been uploaded and is being processed. We'll use face recognition to find the person and send them a notification.
            </p>
            <div className="space-y-3 pt-4">
              <Button asChild className="w-full">
                <Link href="/dashboard/drop-in/discover">View Drop-In Photos</Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
