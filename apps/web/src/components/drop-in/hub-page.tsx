'use client';

import { Camera, Search, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

type DropInTab = 'find' | 'upload';

interface DropInHubPageProps {
  basePath: string;
  defaultTab?: DropInTab;
}

export function DropInHubPage({ basePath, defaultTab = 'find' }: DropInHubPageProps) {
  const [tab, setTab] = useState<DropInTab>(defaultTab);
  const [latestStatusHref, setLatestStatusHref] = useState<string | null>(null);
  const [isCheckingLatestUpload, setIsCheckingLatestUpload] = useState(false);
  const billingHref = basePath.startsWith('/gallery') ? '/gallery/billing' : '/dashboard/billing';

  useEffect(() => {
    if (tab !== 'upload') return;

    let isActive = true;

    const loadLatestUploadStatus = async () => {
      setIsCheckingLatestUpload(true);
      try {
        const response = await fetch('/api/drop-in/verify?latest=1', { cache: 'no-store' });
        if (!response.ok) {
          if (isActive) {
            setLatestStatusHref(null);
          }
          return;
        }

        const data = await response.json().catch(() => null);
        const txRef = data?.dropInPhoto?.transactionRef as string | undefined;
        const photoId = data?.dropInPhoto?.id as string | undefined;

        const params = new URLSearchParams();
        if (txRef) {
          params.set('tx_ref', txRef);
        } else if (photoId) {
          params.set('photo_id', photoId);
        }

        if (isActive) {
          setLatestStatusHref(
            params.toString().length > 0 ? `${basePath}/success?${params.toString()}` : null
          );
        }
      } catch {
        if (isActive) {
          setLatestStatusHref(null);
        }
      } finally {
        if (isActive) {
          setIsCheckingLatestUpload(false);
        }
      }
    };

    void loadLatestUploadStatus();

    return () => {
      isActive = false;
    };
  }, [basePath, tab]);

  const tabCopy = useMemo(() => {
    if (tab === 'find') {
      return {
        title: 'Find Me',
        description:
          'Upload/search for yourself and run contacts or external discovery workflows.',
        primaryHref: `${basePath}/find-me`,
        primaryLabel: 'Open Find Me',
        secondaryHref: `${basePath}/discover`,
        secondaryLabel: 'Incoming Upload Matches',
      };
    }

    return {
      title: 'Upload Someone Else',
      description:
        'Upload a photo of someone you met and let the platform find and notify the matched user.',
      primaryHref: `${basePath}/upload`,
      primaryLabel: 'Start Upload',
      secondaryHref: latestStatusHref,
      secondaryLabel: isCheckingLatestUpload ? 'Checking Status...' : 'Check Upload Status',
    };
  }, [basePath, isCheckingLatestUpload, latestStatusHref, tab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Drop-In</h1>
        <p className="mt-1 text-muted-foreground">
          One place for discovery and upload workflows.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setTab('find')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            tab === 'find'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Search className="h-4 w-4 text-accent" />
            <span className="font-medium text-foreground">Find Me</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Self discovery with contacts + external search options.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setTab('upload')}
          className={`rounded-xl border p-4 text-left transition-colors ${
            tab === 'upload'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-card hover:bg-muted/40'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <Upload className="h-4 w-4 text-accent" />
            <span className="font-medium text-foreground">Upload Someone</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Submit a photo and trigger the Drop-In match + notify pipeline.
          </p>
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-foreground">{tabCopy.title}</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">{tabCopy.description}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={tabCopy.primaryHref}>
              <Camera className="mr-2 h-4 w-4" />
              {tabCopy.primaryLabel}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={billingHref}>Buy Credits</Link>
          </Button>
          {tab === 'upload' ? (
            tabCopy.secondaryHref ? (
              <Button asChild variant="outline">
                <Link href={tabCopy.secondaryHref}>{tabCopy.secondaryLabel}</Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                {tabCopy.secondaryLabel}
              </Button>
            )
          ) : (
            <Button asChild variant="outline">
              <Link href={tabCopy.secondaryHref ?? `${basePath}/discover`}>{tabCopy.secondaryLabel}</Link>
            </Button>
          )}
        </div>
        {tab === 'upload' && !isCheckingLatestUpload && !latestStatusHref ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No tracked upload yet. Start an upload first, then check status.
          </p>
        ) : null}
      </div>
    </div>
  );
}
