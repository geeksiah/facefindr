'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  Camera,
  Scan,
  Lock,
  ChevronRight,
  Share2,
  Twitter,
  Facebook,
  MessageCircle,
  Mail,
  Copy,
  Check,
  X,
  User,
  ImageIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

interface Event {
  id: string;
  name: string;
  description?: string;
  date: string;
  end_date?: string;
  location?: string;
  cover_image_url?: string;
  photo_count: number;
  allow_anonymous_scan: boolean;
  require_access_code: boolean;
  photographers: {
    id: string;
    display_name: string;
    profile_photo_url?: string;
    bio?: string;
  };
}

interface Photo {
  id: string;
  thumbnail_path: string;
  created_at: string;
}

export default function PublicEventPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const codeFromUrl = searchParams.get('code');

  const [event, setEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [accessCode, setAccessCode] = useState(codeFromUrl || '');
  const [codeError, setCodeError] = useState('');
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);

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
    const text = `Find your photos from "${event?.name}" on FaceFindr`;

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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Event Not Found</h1>
          <p className="text-secondary mb-6">{error}</p>
          <Link href="/">
            <Button>Go Home</Button>
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
              className="text-center text-2xl tracking-[0.5em] font-mono uppercase"
              maxLength={10}
              autoFocus
              error={codeError}
            />
            <Button type="submit" className="w-full" disabled={!accessCode.trim()}>
              Access Event
            </Button>
          </form>

          <p className="text-center text-sm text-secondary mt-6">
            Don't have the code? Contact the photographer.
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
                      <Twitter className="h-4 w-4" />
                      Share on Twitter
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <Facebook className="h-4 w-4" />
                      Share on Facebook
                    </button>
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Share on WhatsApp
                    </button>
                    <button
                      onClick={() => handleShare('email')}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted text-left text-foreground transition-colors"
                    >
                      <Mail className="h-4 w-4" />
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
                  {formatDate(event.date)}
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

            {/* Photographer */}
            {event?.photographers && (
              <div className="flex items-center gap-3 p-4 bg-muted rounded-xl mb-6">
                <div className="relative h-12 w-12 rounded-full overflow-hidden bg-secondary/20">
                  {event.photographers.profile_photo_url ? (
                    <Image
                      src={event.photographers.profile_photo_url}
                      alt={event.photographers.display_name}
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
                  <p className="font-medium text-foreground">{event.photographers.display_name}</p>
                  <p className="text-sm text-secondary">Photographer</p>
                </div>
              </div>
            )}

            {event?.description && (
              <p className="text-secondary mb-6">{event.description}</p>
            )}

            {/* CTA - Find Your Photos */}
            <Link href={`/e/${slug}/scan`} className="block">
              <Button size="lg" className="w-full group">
                <Scan className="h-5 w-5 mr-2" />
                Find Your Photos
                <ChevronRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Photo Gallery Preview */}
      {photos.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">Event Photos</h2>
            <p className="text-sm text-secondary">{event?.photo_count} total</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
            {photos.slice(0, 12).map((photo, index) => (
              <div
                key={photo.id}
                className={cn(
                  "relative aspect-square rounded-xl overflow-hidden bg-muted group cursor-pointer",
                  index === 0 && "col-span-2 row-span-2 sm:col-span-1 sm:row-span-1"
                )}
              >
                <Image
                  src={photo.thumbnail_path}
                  alt="Event photo"
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
                {/* Watermark overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-white/20 text-2xl font-bold rotate-[-30deg]">
                    FaceFindr
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(event?.photo_count || 0) > 12 && (
            <div className="text-center mt-8">
              <Link href={`/e/${slug}/scan`}>
                <Button variant="outline">
                  Scan to see all {event?.photo_count} photos
                </Button>
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Empty state */}
      {photos.length === 0 && !loading && (
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Photos Coming Soon</h2>
          <p className="text-secondary mb-6">
            The photographer is still uploading photos for this event. Check back soon!
          </p>
          <Button variant="outline" onClick={() => loadEvent()}>
            Refresh
          </Button>
        </div>
      )}

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
