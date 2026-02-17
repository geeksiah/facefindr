import {
  ArrowLeft,
  Calendar,
  MapPin,
  Globe,
  Lock,
  Settings,
  Image,
  Users,
  Scan,
  Radio,
  MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EventDetailRealtime } from '@/components/events/event-detail-realtime';
import { EventGallery } from '@/components/events/event-gallery';
import { EventSettings } from '@/components/events/event-settings';
import { PhotoUploader } from '@/components/events/photo-uploader';
import { ShareButton } from '@/components/events/share-button';
import { Button } from '@/components/ui/button';
import { getCurrencySymbol } from '@/lib/currency-utils';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

interface EventPageProps {
  params: { id: string };
}

export default async function EventPage({ params }: EventPageProps) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return notFound();
  }

  // Fetch event with pricing
  const { data: event, error } = await serviceClient
    .from('events')
    .select(`
      *,
      event_pricing(*),
      event_access_tokens(id, token, label, created_at, expires_at, revoked_at)
    `)
    .eq('id', params.id)
    .single();

  if (error) {
    console.error('Event fetch error', {
      eventId: params.id,
      userId: user.id,
      error,
    });
    if (error.code === 'PGRST116') {
      return notFound();
    }
    return notFound();
  }

  if (!event) {
    return notFound();
  }

  const isOwner = event.photographer_id === user.id;
  let hasCollaboratorAccess = false;

  if (!isOwner) {
    const { data: collaboratorAccess, error: collaboratorError } = await serviceClient
      .from('event_collaborators')
      .select('id')
      .eq('event_id', params.id)
      .eq('photographer_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (collaboratorError) {
      console.error('Collaborator access check error', {
        eventId: params.id,
        userId: user.id,
        error: collaboratorError,
      });
    }
    hasCollaboratorAccess = Boolean(collaboratorAccess);
  }

  if (!isOwner && !hasCollaboratorAccess) {
    return notFound();
  }

  // Fetch media separately to ensure we get all photos
  let mediaData: any[] = [];
  if (event) {
    const { data: media, error: mediaError } = await serviceClient
      .from('media')
      .select('id, storage_path, thumbnail_path, original_filename, file_size, created_at')
      .eq('event_id', params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (mediaError) {
      console.error('Error fetching media', {
        eventId: params.id,
        userId: user.id,
        error: mediaError,
      });
      // Don't fail the page, just show empty list
      mediaData = [];
    } else if (media) {
      mediaData = media;
    }
  }

  const pricing = event.event_pricing?.[0];
  const mediaCount = mediaData.length;

  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    active: 'bg-success/10 text-success',
    closed: 'bg-warning/10 text-warning',
    archived: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-6">
      {/* Realtime subscription for event updates */}
      <EventDetailRealtime eventId={event.id} />
      
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/events"
            className="mt-1 rounded-xl p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
                    {formatEventDateDisplay(
                      {
                        event_date: event.event_date,
                        event_start_at_utc: event.event_start_at_utc,
                        event_timezone: event.event_timezone,
                      },
                      'en-US',
                      {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      }
                    )}
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

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
            <Link href={`/dashboard/events/${event.id}/settings`}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Link>
          </Button>
          <ShareButton eventId={event.id} />
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
                  {getCurrencySymbol(pricing.currency || 'USD')}{(pricing.price_per_media / 100).toFixed(2)} per photo
                </span>
                {pricing.unlock_all_price && (
                  <span className="rounded-full bg-muted px-3 py-1 font-medium text-foreground">
                    {getCurrencySymbol(pricing.currency || 'USD')}{(pricing.unlock_all_price / 100).toFixed(2)} unlock all
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
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-foreground">Photos ({mediaCount})</h2>
          {mediaCount > 0 && (
            <Button variant="outline" size="sm">
              Select All
            </Button>
          )}
        </div>
        <EventGallery eventId={event.id} photos={mediaData} />
      </div>
    </div>
  );
}
