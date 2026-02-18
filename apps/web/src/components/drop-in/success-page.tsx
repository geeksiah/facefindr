'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

type VerifyState = 'processing' | 'completed' | 'failed_payment' | 'processing_failed' | 'timeout';

const MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2000;

interface DropInSuccessPageProps {
  basePath: string;
}

export function DropInSuccessPage({ basePath }: DropInSuccessPageProps) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerifyState>('processing');
  const [message, setMessage] = useState('Verifying payment and processing your Drop-In upload...');
  const [attempts, setAttempts] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const keys = ['session_id', 'tx_ref', 'order_id', 'reference', 'provider'];

    for (const key of keys) {
      const value = searchParams?.get(key);
      if (value) {
        params.set(key, value);
      }
    }

    return params.toString();
  }, [searchParams]);

  const verify = useCallback(async () => {
    try {
      const response = await fetch(`/api/drop-in/verify${queryString ? `?${queryString}` : ''}`, {
        cache: 'no-store',
      });

      if (response.status === 404) {
        return false;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState('timeout');
        setMessage(data?.error || 'Unable to verify Drop-In upload status.');
        return true;
      }

      const status = data?.status as string;
      if (status === 'completed') {
        const matches = Number(data?.dropInPhoto?.matchesFound || 0);
        setState('completed');
        setMessage(
          matches > 0
            ? `Upload complete. We found ${matches} potential match${matches === 1 ? '' : 'es'}.`
            : 'Upload complete. Processing finished and your photo is now discoverable.'
        );
        return true;
      }

      if (status === 'failed_payment') {
        setState('failed_payment');
        setMessage('Payment failed or was not confirmed. Please retry upload.');
        return true;
      }

      if (status === 'processing_failed') {
        setState('processing_failed');
        setMessage('Payment succeeded, but processing failed. Please retry processing.');
        return true;
      }

      setState('processing');
      setMessage('Payment verified. Processing and face matching are still running...');
      return false;
    } catch {
      return false;
    }
  }, [queryString]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;

      const done = await verify();
      if (done || cancelled) return;

      setAttempts((prev) => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) {
          setState('timeout');
          setMessage('Verification is taking longer than expected. You can safely continue.');
          return next;
        }
        return next;
      });

      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [verify]);

  const isDone = state !== 'processing';
  const isError = state === 'failed_payment' || state === 'processing_failed' || state === 'timeout';

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto mt-20 max-w-md space-y-6 rounded-2xl border border-border bg-card p-6 text-center">
        {state === 'processing' ? (
          <Loader2 className="mx-auto h-14 w-14 animate-spin text-accent" />
        ) : isError ? (
          <AlertCircle className="mx-auto h-14 w-14 text-destructive" />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-10 w-10 text-success" />
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {state === 'processing'
              ? 'Processing Drop-In'
              : isError
                ? 'Drop-In Needs Attention'
                : 'Drop-In Completed'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          {!isDone && <p className="mt-1 text-xs text-muted-foreground">Attempt {attempts + 1}</p>}
        </div>

        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href={`${basePath}/discover`}>View Drop-In Photos</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`${basePath}/upload`}>Upload Another</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href={basePath}>Back to Drop-In Hub</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
