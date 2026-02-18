'use client';

import { Camera, Search, Sparkles, Upload } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';

type DropInTab = 'find' | 'upload';

export default function DropInHubPage() {
  const [tab, setTab] = useState<DropInTab>('find');

  const tabCopy = useMemo(() => {
    if (tab === 'find') {
      return {
        title: 'Find Photos of Me',
        description:
          'Run Drop-In discovery to find matching photos from your network and external contributors.',
        primaryHref: '/dashboard/drop-in/discover',
        primaryLabel: 'Open Discover',
        secondaryHref: '/gallery/drop-in',
        secondaryLabel: 'Open Attendee Drop-In',
      };
    }

    return {
      title: 'Upload Someone Else',
      description:
        'Upload a photo of someone you met and let the platform find and notify the matched user.',
      primaryHref: '/dashboard/drop-in/upload',
      primaryLabel: 'Start Upload',
      secondaryHref: '/dashboard/drop-in/success',
      secondaryLabel: 'Check Recent Status',
    };
  }, [tab]);

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
            Discover matched photos from contacts and external uploads.
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
            <Link href={tabCopy.secondaryHref}>{tabCopy.secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

