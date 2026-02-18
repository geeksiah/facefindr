'use client';

import { ArrowLeft, Globe, Loader2, Search, ShieldCheck, Users, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface FindMeSearch {
  id: string;
  searchType: 'internal' | 'contacts' | 'external';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  matchCount: number;
  creditsUsed: number;
  errorMessage: string | null;
  createdAt: string;
}

interface FindMeResult {
  id: string;
  source: string;
  confidence: number;
  thumbnailUrl: string | null;
  externalUrl: string | null;
  eventName: string | null;
  photographerName: string | null;
}

interface DropInFindMePageProps {
  basePath: string;
  billingPath: string;
}

const INTERNAL_SEARCH_CREDITS = 3;
const CONTACTS_SEARCH_CREDITS = 3;
const EXTERNAL_SEARCH_CREDITS = 5;

export function DropInFindMePage({ basePath, billingPath }: DropInFindMePageProps) {
  const toast = useToast();
  const [credits, setCredits] = useState(0);
  const [contactQuery, setContactQuery] = useState('');
  const [searches, setSearches] = useState<FindMeSearch[]>([]);
  const [results, setResults] = useState<FindMeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [activeType, setActiveType] = useState<'internal' | 'contacts' | 'external' | null>(null);
  const canRunInternal = useMemo(() => credits >= INTERNAL_SEARCH_CREDITS, [credits]);
  const canRunContacts = useMemo(() => credits >= CONTACTS_SEARCH_CREDITS, [credits]);
  const canRunExternal = useMemo(() => credits >= EXTERNAL_SEARCH_CREDITS, [credits]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/drop-in/find-me', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load Drop-In data');
      }

      setCredits(Number(data.credits || 0));
      setSearches(Array.isArray(data.searches) ? data.searches : []);
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (error: any) {
      toast.error('Unable to load', error.message || 'Drop-In data unavailable');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const runSearch = async (searchType: 'internal' | 'contacts' | 'external') => {
    const requiredCredits =
      searchType === 'external'
        ? EXTERNAL_SEARCH_CREDITS
        : searchType === 'contacts'
          ? CONTACTS_SEARCH_CREDITS
          : INTERNAL_SEARCH_CREDITS;

    if (credits < requiredCredits) {
      toast.error('Insufficient credits', `${requiredCredits} credits required for this search type`);
      return;
    }

    if (searchType === 'contacts' && contactQuery.trim().length > 0 && contactQuery.trim().length < 2) {
      toast.error('Contact name too short', 'Enter at least 2 characters');
      return;
    }

    try {
      setIsSearching(true);
      setActiveType(searchType);
      const response = await fetch('/api/drop-in/find-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchType,
          contactQuery: contactQuery.trim() || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      toast.success('Search completed', `Found ${data.resultsCount || 0} result(s)`);
      await loadData();
    } catch (error: any) {
      toast.error('Search failed', error.message || 'Unable to run search');
    } finally {
      setIsSearching(false);
      setActiveType(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:text-foreground">
        <Link href={basePath}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Drop-In Hub
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drop-In: Find Me</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search across Ferchr internally, by contacts, or via external platform crawl.
          </p>
        </div>
        <div className="rounded-full bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
          {credits} credit{credits === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h2 className="font-semibold text-foreground">Internal Search</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Searches your Ferchr photos, including subscribed and matched event photos.
          </p>
          <Button
            onClick={() => runSearch('internal')}
            disabled={isSearching || !canRunInternal}
            variant="outline"
            className="w-full"
          >
            {isSearching && activeType === 'internal' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Run Internal Search (3 credits)
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-success" />
            <h2 className="font-semibold text-foreground">Contacts Search</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Optional: enter a contact name to find photos containing both of you.
          </p>
          <Input
            placeholder="Contact name or @FaceTag"
            value={contactQuery}
            onChange={(event) => setContactQuery(event.target.value)}
            className="mb-3"
          />
          <Button
            onClick={() => runSearch('contacts')}
            disabled={isSearching || !canRunContacts}
            variant="outline"
            className="w-full"
          >
            {isSearching && activeType === 'contacts' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Search Contacts (3 credits)
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            <h2 className="font-semibold text-foreground">External Search</h2>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Searches social media, websites, and blogs via external crawler integrations.
          </p>
          <Button onClick={() => runSearch('external')} disabled={isSearching || !canRunExternal} className="w-full">
            {isSearching && activeType === 'external' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Run External Search (5 credits)
          </Button>
          {!canRunExternal && (
            <p className="mt-2 text-xs text-muted-foreground">
              Buy credits from <a href={billingPath} className="text-accent underline">Billing</a>.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent Searches</h3>
        {searches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No searches yet.</p>
        ) : (
          <div className="space-y-2">
            {searches.slice(0, 8).map((search) => (
              <div key={search.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {search.searchType === 'external'
                      ? 'External'
                      : search.searchType === 'internal'
                        ? 'Internal'
                        : 'Contacts'} search
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(search.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-foreground">{search.matchCount} matches</p>
                  <p className="text-xs text-muted-foreground">{search.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Results</h3>
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No results yet. Run a Drop-In search to populate this feed.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((result) => (
              <div key={result.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="relative aspect-square bg-muted">
                  {result.thumbnailUrl ? (
                    <Image src={result.thumbnailUrl} alt="Drop-In result" fill className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No preview</div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium text-foreground">{result.eventName || 'Matched photo'}</p>
                  <p className="truncate text-xs text-muted-foreground">{result.photographerName || 'Unknown creator'}</p>
                  <p className="text-xs text-accent">
                    {result.source} - {Math.round(result.confidence)}%
                  </p>
                  {result.externalUrl && (
                    <a
                      href={result.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-xs text-foreground underline"
                    >
                      View source page
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
