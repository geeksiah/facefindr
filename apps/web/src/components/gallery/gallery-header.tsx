'use client';

import { Search, X, Camera, Calendar, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

import { formatEventDateDisplay } from '@/lib/events/time';

interface SearchResult {
  id: string;
  name?: string;
  display_name?: string;
  face_tag?: string;
  public_profile_slug?: string;
  profile_photo_url?: string;
  event_date?: string;
  event_start_at_utc?: string;
  event_timezone?: string;
  type: 'event' | 'photographer' | 'attendee';
}

export function GallerySearch() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const activeSearchRequestRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    const includePublicSeed = trimmedQuery.length < 1;

    const requestId = activeSearchRequestRef.current + 1;
    activeSearchRequestRef.current = requestId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    setIsSearching(true);
    setShowResults(true);

    try {
      const searchTerm = trimmedQuery.toLowerCase();
      const newResults: SearchResult[] = [];

      const response = await fetch(
        includePublicSeed
          ? '/api/social/search?includePublicSeed=true&type=all&limit=10'
          : `/api/social/search?q=${encodeURIComponent(searchTerm)}&type=all&limit=10`,
        { signal: controller.signal, cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error(`Search request failed (${response.status})`);
      }

      const data = await response.json();
      newResults.push(
        ...(data.photographers || []).map((person: any) => ({ ...person, type: 'photographer' as const })),
        ...(data.users || []).map((person: any) => ({ ...person, type: 'attendee' as const }))
      );

      if (requestId === activeSearchRequestRef.current) {
        setResults(newResults);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (requestId === activeSearchRequestRef.current) {
        console.error('Search error:', error);
        setResults([]);
      }
    } finally {
      clearTimeout(timeoutId);
      if (requestId === activeSearchRequestRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      void performSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    
    if (result.type === 'event') {
      router.push(`/gallery/events/${result.id}`);
    } else if (result.type === 'attendee') {
      const attendeeSlug = result.public_profile_slug || result.face_tag?.replace(/^@/, '') || result.id;
      router.push(`/gallery/people/attendee/${attendeeSlug}`);
    } else {
      const creatorSlug = result.public_profile_slug || result.face_tag?.replace(/^@/, '') || result.id;
      router.push(`/gallery/people/creator/${creatorSlug}`);
    }
  };

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Search events, photographers..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowResults(true)}
          className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setShowResults(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
          {isSearching ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No results found
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors"
                >
                  {result.type !== 'event' && result.profile_photo_url ? (
                    <img
                      src={result.profile_photo_url}
                      alt={result.display_name || ''}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      result.type === 'event'
                        ? 'bg-accent/10 text-accent'
                        : result.type === 'attendee'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-purple-500/10 text-purple-500'
                    }`}>
                      {result.type === 'event' ? (
                        <Calendar className="h-4 w-4" />
                      ) : result.type === 'attendee' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {result.name || result.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.type === 'event' 
                        ? formatEventDateDisplay(
                            {
                              event_date: result.event_date,
                              event_start_at_utc: result.event_start_at_utc,
                              event_timezone: result.event_timezone,
                            },
                            'en-US'
                          )
                        : result.face_tag || (result.type === 'attendee' ? 'Attendee' : 'Creator')
                      }
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
