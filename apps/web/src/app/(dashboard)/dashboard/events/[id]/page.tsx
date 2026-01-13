import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Globe,
  Lock,
  Settings,
  Share2,
  Image,
  Users,
  Scan,
  Radio,
  MoreHorizontal,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { PhotoUploader } from '@/components/events/photo-uploader';
import { EventGallery } from '@/components/events/event-gallery';
import { EventSettings } from '@/components/events/event-settings';
import { EventSharePanel } from '@/components/events/event-share-panel';
import { cn } from '@/lib/utils';

interface EventPageProps {
  params: { id: string };
}

export default async function EventPage({ params }: EventPageProps) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return notFound();
  }

  // Fetch event with pricing and media count
  const { data: event, error } = await supabase
    .from('events')
    .select(`
      *,
      event_pricing(*),
      media(id, storage_path, thumbnail_path, original_filename, file_size, created_at),
      event_access_tokens(id, token, label, created_at, expires_at, revoked_at)
    `)
    .eq('id', params.id)
    .eq('photographer_id', user.id)
    .single();

  if (error || !event) {
    return notFound();
  }

  const pricing = event.event_pricing?.[0];
  const mediaCount = event.media?.length || 0;

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    active: 'bg-success/10 text-success',
    closed: 'bg-warning/10 text-warning',
    archived: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/events"
            className="mt-1 rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[event.status])}>
                {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {event.event_date && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(event.event_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
              {event.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {event.is_public ? (
                  <>
                    <Globe className="h-4 w-4" />
                    <span>Public</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <span>Private</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/events/${event.id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
          <Button size="sm">
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/10 p-2.5">
              <Image className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Photos</p>
              <p className="text-2xl font-bold text-foreground">{mediaCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-muted p-2.5">
              <Users className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Attendees</p>
              <p className="text-2xl font-bold text-foreground">0</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className={cn('rounded-xl p-2.5', event.face_recognition_enabled ? 'bg-success/10' : 'bg-muted')}>
              <Scan className={cn('h-5 w-5', event.face_recognition_enabled ? 'text-success' : 'text-muted-foreground')} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Face Recognition</p>
              <p className="text-lg font-semibold text-foreground">
                {event.face_recognition_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className={cn('rounded-xl p-2.5', event.live_mode_enabled ? 'bg-accent/10' : 'bg-muted')}>
              <Radio className={cn('h-5 w-5', event.live_mode_enabled ? 'text-accent' : 'text-muted-foreground')} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Live Mode</p>
              <p className="text-lg font-semibold text-foreground">
                {event.live_mode_enabled ? 'Active' : 'Off'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Info */}
      {pricing && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground mb-3">Pricing</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {pricing.is_free ? (
              <span className="rounded-full bg-success/10 px-3 py-1 font-medium text-success">
                Free Downloads
              </span>
            ) : (
              <>
                <span className="rounded-full bg-accent/10 px-3 py-1 font-medium text-accent">
                  ${(pricing.price_per_media / 100).toFixed(2)} per photo
                </span>
                {pricing.unlock_all_price && (
                  <span className="rounded-full bg-muted px-3 py-1 font-medium text-foreground">
                    ${(pricing.unlock_all_price / 100).toFixed(2)} unlock all
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Upload Photos</h2>
        <PhotoUploader eventId={event.id} />
      </div>

      {/* Gallery */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Photos ({mediaCount})</h2>
          {mediaCount > 0 && (
            <Button variant="outline" size="sm">
              Select All
            </Button>
          )}
        </div>
        <EventGallery eventId={event.id} photos={event.media || []} />
      </div>
    </div>
  );
}
