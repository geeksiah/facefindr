'use client';

import {
  Calendar,
  MapPin,
  Camera,
  Scan,
  Lock,
  ChevronRight,
  Share2,
  Copy,
  Check,
  X,
  User,
  ImageIcon,
  LayoutDashboard,
  Home,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/ui/logo';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Monochrome social icons
const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

interface Creator {
  id: string;
  display_name: string;
  profile_photo_url?: string;
  bio?: string;
}

interface Event {
  id: string;
  name: string;
  description?: string;
  date: string;
  event_date?: string;
  event_start_at_utc?: string | null;
  event_timezone?: string;
  end_date?: string;
  location?: string;
  cover_image_url?: string;
  photo_count: number;
  allow_anonymous_scan: boolean;
  require_access_code: boolean;
  // Primary photographer (owner)
  photographer: Creator;
  // All photographers (including collaborators)
  all_photographers?: Creator[];
  // Employer/client info (if applicable)
  employer_id?: string;
  employer_name?: string;
}

interface Photo {
  id: string;
  thumbnail_path: string;
  thumbnail_url?: string | null;
  created_at: string;
}

export default function PublicEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const codeFromUrl = searchParams?.get('code');

  const [event, setEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [accessCode, setAccessCode] = useState(codeFromUrl || '');
  const [codeError, setCodeError] = useState('');
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check if user is logged in
  useEffect(() => {
    async function checkAuth() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);
      } catch (e) {
        setIsLoggedIn(false);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    loadEvent();
  }, [slug]);

  async function loadEvent(code?: string) {
    try {
      setLoading(true);
      setError(null);
      setCodeError('');

      const codeParam = code || codeFromUrl || '';
      const res = await fetch(`/api/events/public/${slug}${codeParam ? `?code=${codeParam}` : ''}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'access_code_required') {
          setNeedsCode(true);
          if (data.event) {
            setEvent(data.event);
          }
        } else if (data.error === 'Invalid access code') {
          setCodeError('Invalid access code. Please try again.');
        } else {
          setError(data.error || 'Event not found');
        }
        return;
      }

      setNeedsCode(false);
      setEvent(data.event);
      setPhotos(data.photos || []);
    } catch (err) {
      setError('Failed to load event');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (accessCode.trim()) {
      loadEvent(accessCode.trim().toUpperCase());
    }
  }

  async function handleShare(platform: string) {
    const eventUrl = window.location.href;
    const text = `Find your photos from "${event?.name}" on Ferchr`;

    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(eventUrl)}&text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`, '_blank');
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + eventUrl)}`, '_blank');
        break;
      case 'email':
        window.location.href = `mailto:?subject=${encodeURIComponent(`Photos from ${event?.name}`)}&body=${encodeURIComponent(text + '\n\n' + eventUrl)}`;
        break;
      case 'copy':
        await navigator.clipboard.writeText(eventUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        break;
    }
    setShowShareMenu(false);
  }

  function formatDate(eventData: Event) {
    return formatEventDateDisplay(
      {
        event_date: eventData.event_date || eventData.date,
        event_start_at_utc: eventData.event_start_at_utc || null,
        event_timezone: eventData.event_timezone || 'UTC',
      },
      'en-US',
      {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      }
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-secondary">Loading event...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const homeUrl = isLoggedIn ? '/dashboard' : '/';
    const homeLabel = isLoggedIn ? 'Go to Dashboard' : 'Go Home';
    const HomeIcon = isLoggedIn ? LayoutDashboard : Home;
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Event Not Found</h1>
          <p className="text-secondary mb-6">{error}</p>
          <Link href={homeUrl}>
            <Button>
              <HomeIcon className="w-4 h-4 mr-2" />
              {homeLabel}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Access code required screen
  if (needsCode) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <Link href="/">
              <Logo variant="combo" className="h-8" />
            </Link>
          </div>
        </header>

        <div className="max-w-md mx-auto px-4 py-16">
          {/* Event preview */}
          {event?.cover_image_url && (
            <div className="relative aspect-video rounded-2xl overflow-hidden mb-8">
              <Image
                src={event.cover_image_url}
                alt={event.name || 'Event'}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-xl font-bold text-white">{event.name}</h2>
              </div>
            </div>
          )}

          {/* Access code form */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Enter Access Code</h1>
            <p className="text-secondary">
              This event requires an access code to view photos.
            </p>
          </div>

          <form onSubmit={handleSubmitCode} className="space-y-4">
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="px-3 text-center font-mono uppercase text-xl tracking-[0.25em] sm:text-2xl sm:tracking-[0.5em]"
              maxLength={10}
              autoFocus
              error={codeError}
            />
            <Button type="submit" className="w-full" disabled={!accessCode.trim()}>
              Access Event
            </Button>
          </form>

          <p className="text-center text-sm text-secondary mt-6">
            Don&apos;t have the code? Contact the creator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <Logo variant="combo" className="h-8" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowShareMenu(!showShareMenu)}
              >
                <Share2 className="h-5 w-5" />
              </Button>
              
              {/* Share menu */}
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-card shadow-lg z-50 p-2">
                    <button
                      onClick={() => handleShare('twitter')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <XIcon />
                      Share on X
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <FacebookIcon />
                      Share on Facebook
                    </button>
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <WhatsAppIcon />
                      Share on WhatsApp
                    </button>
                    <button
                      onClick={() => handleShare('email')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <EmailIcon />
                      Email Link
                    </button>
                    <div className="border-t border-border my-2" />
                    <button
                      onClick={() => handleShare('copy')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative">
        {event?.cover_image_url ? (
          <div className="relative h-64 sm:h-80 lg:h-96">
            <Image
              src={event.cover_image_url}
              alt={event.name}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-br from-accent/20 to-accent/5" />
        )}

        {/* Event info */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 -mt-20 pb-8">
          <div className="bg-card rounded-2xl border border-border p-6 shadow-lg">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">{event?.name}</h1>
            
            <div className="flex flex-wrap gap-4 text-sm text-secondary mb-6">
              {event?.date && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(event)}
                </div>
              )}
              {event?.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {event.location}
                </div>
              )}
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                {event?.photo_count || 0} photos
              </div>
            </div>

            {/* Creators */}
            {(event?.photographer || event?.all_photographers) && (
              <div className="mb-6">
                {/* Show all photographers if multiple */}
                {event.all_photographers && event.all_photographers.length > 1 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-secondary">Creators</p>
                    <div className="flex flex-wrap gap-3">
                      {event.all_photographers.map((photographer) => (
                        <div key={photographer.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                          <div className="relative h-8 w-8 rounded-full overflow-hidden bg-secondary/20">
                            {photographer.profile_photo_url ? (
                              <Image
                                src={photographer.profile_photo_url}
                                alt={photographer.display_name}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <User className="h-4 w-4 text-secondary" />
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-foreground">{photographer.display_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Single photographer */
                  <div className="flex items-center gap-3 p-4 bg-muted rounded-xl">
                    <div className="relative h-12 w-12 rounded-full overflow-hidden bg-secondary/20">
                      {event.photographer?.profile_photo_url ? (
                        <Image
                          src={event.photographer.profile_photo_url}
                          alt={event.photographer.display_name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <User className="h-6 w-6 text-secondary" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{event.photographer?.display_name}</p>
                      <p className="text-sm text-secondary">Creator</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {event?.description && (
              <p className="text-secondary mb-6">{event.description}</p>
            )}

            {/* CTA - Find Your Photos */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={`/e/${slug}/scan`} className="flex-1 sm:flex-initial">
                <Button size="lg" className="w-full sm:w-auto sm:min-w-[200px] group">
                  <Scan className="h-5 w-5 mr-2" />
                  Find Your Photos
                  <ChevronRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Count Info - No preview, photos only visible after face scan */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl border border-border bg-card/50 p-8 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Camera className="w-8 h-8 text-accent" />
          </div>
          
          {(event?.photo_count || 0) > 0 ? (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                {event?.photo_count?.toLocaleString()} Photos Available
              </h2>
              <p className="text-secondary mb-6 max-w-md mx-auto">
                Use the face scanner to find photos of yourself. Your photos will be matched using AI-powered face recognition.
              </p>
              <Link href={`/e/${slug}/scan`}>
                <Button size="lg" className="group">
                  <Scan className="h-5 w-5 mr-2" />
                  Find Your Photos
                  <ChevronRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-foreground mb-2">Photos Coming Soon</h2>
              <p className="text-secondary mb-6">
                The creator is still uploading photos for this event. Check back soon!
              </p>
              <Button variant="outline" onClick={() => loadEvent()}>
                Refresh
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <Link href="/" className="inline-block mb-4">
            <Logo variant="combo" className="h-6 opacity-60 hover:opacity-100 transition-opacity" />
          </Link>
          <p className="text-sm text-secondary">
            Find your photos instantly with AI-powered face recognition
          </p>
        </div>
      </footer>
    </div>
  );
}
