'use client';

import { Search, X, Camera, Calendar, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  id: string;
  name?: string;
  display_name?: string;
  event_date?: string;
  event_start_at_utc?: string;
  event_timezone?: string;
  type: 'event' | 'photographer';
}

export function GallerySearch() {
  const router = useRouter();
  const supabase = createClient();
  const searchRef = useRef<HTMLDivElement>(null);
  
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
    if (searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      const searchTerm = searchQuery.toLowerCase();
      const newResults: SearchResult[] = [];

      // Search events
      const { data: events } = await supabase
        .from('events')
        .select('id, name, event_date, event_start_at_utc, event_timezone')
        .ilike('name', `%${searchTerm}%`)
        .limit(5);

      if (events) {
        newResults.push(...events.map(e => ({ ...e, type: 'event' as const })));
      }

      // Search photographers
      const { data: photographers } = await supabase
        .from('photographers')
        .select('id, display_name')
        .or(`display_name.ilike.%${searchTerm}%,face_tag.ilike.%${searchTerm}%`)
        .eq('is_public_profile', true)
        .limit(5);

      if (photographers) {
        newResults.push(...photographers.map(p => ({ ...p, type: 'photographer' as const })));
      }

      setResults(newResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    
    if (result.type === 'event') {
      router.push(`/gallery/events/${result.id}`);
    } else {
      router.push(`/c/${result.id}`);
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
          onFocus={() => query.length >= 2 && setShowResults(true)}
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
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    result.type === 'event' ? 'bg-accent/10 text-accent' : 'bg-purple-500/10 text-purple-500'
                  }`}>
                    {result.type === 'event' ? (
                      <Calendar className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </div>
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
                        : 'Creator'
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
