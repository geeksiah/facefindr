'use client';

import { Search, Plus, Moon, Sun, X, Camera, Calendar, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useState, useEffect, useRef, useCallback } from 'react';

import { NotificationBell } from '@/components/notifications';
import { Button } from '@/components/ui/button';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';

interface SearchResult {
  id: string;
  name?: string;
  display_name?: string;
  event_date?: string;
  event_start_at_utc?: string;
  event_timezone?: string;
  type: 'event' | 'creator' | 'photographer' | 'attendee';
}

export function DashboardHeader() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const supabase = createClient();

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      const searchTerm = query.toLowerCase();
      const results: SearchResult[] = [];

      // Search events
      const { data: events } = await supabase
        .from('events')
        .select('id, name, event_date, event_start_at_utc, event_timezone')
        .ilike('name', `%${searchTerm}%`)
        .limit(5);

      if (events) {
        results.push(...events.map(e => ({ ...e, type: 'event' as const })));
      }

      // Search photographers
      const { data: photographers } = await supabase
        .from('photographers')
        .select('id, display_name')
        .or(`display_name.ilike.%${searchTerm}%,face_tag.ilike.%${searchTerm}%`)
        .limit(5);

      if (photographers) {
        results.push(...photographers.map(p => ({ ...p, type: 'photographer' as const })));
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    
    if (result.type === 'event') {
      router.push(`/dashboard/events/${result.id}`);
    } else if (result.type === 'creator' || result.type === 'photographer') {
      router.push(`/c/${result.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowResults(false);
      setSearchQuery('');
    }
  };

  return (
    <header className="flex-shrink-0 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      {/* Left side */}
      <div className="flex items-center gap-4">
        {/* Mobile spacer for menu button */}
        <div className="w-12 lg:hidden" />
        
        {/* Search */}
        <div className="relative hidden sm:block" ref={searchRef}>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
          <input
            type="search"
            name="dashboard-search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="Search events, photographers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            onKeyDown={handleKeyDown}
            className="h-10 w-72 rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setShowResults(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50">
              {isSearching ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No results found
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {searchResults.map((result) => (
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
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Mobile search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:hidden"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Notifications */}
        <NotificationBell />

        {/* Create Event Button */}
        <Button asChild size="sm" variant="primary" className="ml-1">
          <Link href="/dashboard/events/new">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Event</span>
          </Link>
        </Button>
      </div>

      {/* Mobile search bar (expandable) */}
      {searchOpen && (
        <div className="absolute inset-x-0 top-full border-b border-border bg-card p-4 sm:hidden z-50">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              name="dashboard-search-mobile"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Search events, photographers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {/* Mobile search results */}
          {showResults && searchQuery.length >= 2 && (
            <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden">
              {isSearching ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No results found
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => {
                        handleResultClick(result);
                        setSearchOpen(false);
                      }}
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
      )}
    </header>
  );
}
