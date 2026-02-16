'use client';

import { useState, useEffect } from 'react';
import { 
  Zap, 
  Upload, 
  Search, 
  Image as ImageIcon,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  Camera,
  Globe,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';

interface DropInSearch {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  searchType: 'contacts' | 'external';
  matchCount: number;
  createdAt: string;
  completedAt: string | null;
}

interface DropInMatch {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  photographerName: string;
  confidence: number;
  source: 'ferchr' | 'external';
}

export default function DropInPage() {
  const toast = useToast();
  const supabase = createClient();
  const [credits, setCredits] = useState(0);
  const [searches, setSearches] = useState<DropInSearch[]>([]);
  const [recentMatches, setRecentMatches] = useState<DropInMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadDropInData();
  }, []);

  const loadDropInData = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load credits
      const { data: attendee } = await supabase
        .from('attendees')
        .select('drop_in_credits')
        .eq('id', user.id)
        .single();

      if (attendee) {
        setCredits(attendee.drop_in_credits || 0);
      }

      // Load search history
      const { data: searchHistory } = await supabase
        .from('drop_in_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (searchHistory) {
        setSearches(searchHistory.map((s: any) => ({
          id: s.id,
          status: s.status,
          searchType: s.search_type,
          matchCount: s.match_count || 0,
          createdAt: s.created_at,
          completedAt: s.completed_at,
        })));
      }

      // Load recent matches
      const { data: matches } = await supabase
        .from('drop_in_matches')
        .select(`
          id,
          confidence,
          source,
          media:media_id (
            thumbnail_path,
            event:event_id (
              name,
              photographer:photographer_id (
                display_name
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12);

      if (matches) {
        setRecentMatches(matches.map((m: any) => ({
          id: m.id,
          thumbnailUrl: m.media?.thumbnail_path 
            ? supabase.storage.from('media').getPublicUrl(m.media.thumbnail_path).data.publicUrl
            : '',
          eventName: m.media?.event?.name || 'Unknown Event',
          photographerName: m.media?.event?.photographer?.display_name || 'Unknown',
          confidence: m.confidence,
          source: m.source,
        })));
      }
    } catch (err) {
      console.error('Failed to load drop-in data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startSearch = async (type: 'contacts' | 'external') => {
    if (type === 'external' && credits < 1) {
      toast.error('No Credits', 'You need Drop-in credits for external search. Buy credits in Billing.');
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch('/api/drop-in/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchType: type }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      toast.success('Search Started', 'We\'re searching for your photos. This may take a few minutes.');
      
      // Reload data
      loadDropInData();
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Search Failed', 'Unable to start search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading Drop-in...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drop-In</h1>
          <p className="text-secondary mt-1">Find photos of yourself across the web</p>
        </div>
        <div className="flex items-center gap-2 bg-accent/10 rounded-full px-4 py-2">
          <Zap className="h-4 w-4 text-accent" />
          <span className="font-semibold text-accent">{credits} credits</span>
        </div>
      </div>

      {/* Search Options */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Free: Contact Search */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-success/10 p-2">
              <Users className="h-6 w-6 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Contact Search</h3>
              <p className="text-xs text-success">Free</p>
            </div>
          </div>
          <p className="text-sm text-secondary mb-4">
            Search for photos from your contacts and events you've attended on Ferchr.
          </p>
          <Button 
            className="w-full" 
            variant="outline"
            onClick={() => startSearch('contacts')}
            disabled={isSearching}
          >
            <Search className="h-4 w-4 mr-2" />
            Search Contacts
          </Button>
        </div>

        {/* Paid: External Search */}
        <div className="rounded-xl border border-accent/50 bg-gradient-to-br from-accent/5 to-accent/10 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg bg-accent/20 p-2">
              <Globe className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">External Search</h3>
              <p className="text-xs text-accent">1 credit per search</p>
            </div>
          </div>
          <p className="text-sm text-secondary mb-4">
            Search across external platforms, social media, and websites for photos of you.
          </p>
          <Button 
            className="w-full" 
            onClick={() => startSearch('external')}
            disabled={isSearching || credits < 1}
          >
            <Zap className="h-4 w-4 mr-2" />
            External Search
          </Button>
          {credits < 1 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              <Link href="/gallery/billing" className="text-accent hover:underline">
                Buy credits
              </Link>
              {' '}to use external search
            </p>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-muted/30 p-6">
        <h3 className="font-semibold text-foreground mb-4">How Drop-In Works</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-accent/10 w-8 h-8 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-semibold">1</span>
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">Upload Your Face</p>
              <p className="text-xs text-secondary">We use your registered face profile</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-accent/10 w-8 h-8 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-semibold">2</span>
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">We Search</p>
              <p className="text-xs text-secondary">AI scans for matching photos</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-accent/10 w-8 h-8 flex items-center justify-center flex-shrink-0">
              <span className="text-accent font-semibold">3</span>
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">Get Notified</p>
              <p className="text-xs text-secondary">We'll alert you when we find matches</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Searches */}
      {searches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Search History</h2>
          <div className="space-y-3">
            {searches.map((search) => (
              <div 
                key={search.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${
                    search.searchType === 'external' ? 'bg-accent/10' : 'bg-success/10'
                  }`}>
                    {search.searchType === 'external' ? (
                      <Globe className="h-5 w-5 text-accent" />
                    ) : (
                      <Users className="h-5 w-5 text-success" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {search.searchType === 'external' ? 'External Search' : 'Contact Search'}
                    </p>
                    <p className="text-xs text-secondary">
                      {new Date(search.createdAt).toLocaleDateString()} at{' '}
                      {new Date(search.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {search.status === 'completed' && (
                    <span className="text-sm text-foreground">{search.matchCount} matches</span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                    search.status === 'completed' ? 'bg-success/10 text-success' :
                    search.status === 'processing' ? 'bg-accent/10 text-accent' :
                    search.status === 'pending' ? 'bg-warning/10 text-warning' :
                    'bg-destructive/10 text-destructive'
                  }`}>
                    {search.status === 'completed' ? <CheckCircle className="h-3 w-3" /> :
                     search.status === 'processing' ? <Clock className="h-3 w-3 animate-spin" /> :
                     search.status === 'pending' ? <Clock className="h-3 w-3" /> :
                     <AlertCircle className="h-3 w-3" />}
                    {search.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Matches */}
      {recentMatches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Matches</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {recentMatches.map((match) => (
              <div 
                key={match.id}
                className="group relative aspect-square rounded-xl overflow-hidden border border-border"
              >
                {match.thumbnailUrl ? (
                  <Image
                    src={match.thumbnailUrl}
                    alt="Match"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-muted">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                
                {/* Source badge */}
                <div className="absolute top-2 left-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    match.source === 'external' 
                      ? 'bg-accent/90 text-white' 
                      : 'bg-success/90 text-white'
                  }`}>
                    {match.source === 'external' ? 'External' : 'Ferchr'}
                  </span>
                </div>

                {/* Confidence */}
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full">
                    {Math.round(match.confidence * 100)}%
                  </span>
                </div>

                {/* Info overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white text-xs truncate">{match.eventName}</p>
                  <p className="text-white/70 text-[10px] truncate">by {match.photographerName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {searches.length === 0 && recentMatches.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No searches yet</h3>
          <p className="text-secondary mb-4">
            Start a search to find photos of yourself across events and the web.
          </p>
          <Button onClick={() => startSearch('contacts')}>
            <Search className="h-4 w-4 mr-2" />
            Start Your First Search
          </Button>
        </div>
      )}
    </div>
  );
}
