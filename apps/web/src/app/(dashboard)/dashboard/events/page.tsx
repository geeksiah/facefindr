import {
  Calendar,
  Plus,
  Search,
  Filter,
  Image,
  Eye,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';

import { DeleteEventButton } from '@/components/events/delete-event-button';
import { EventsListRealtime } from '@/components/events/events-list-realtime';
import { Button } from '@/components/ui/button';
import { getCurrencySymbol } from '@/lib/currency-utils';
import { formatEventDateDisplay } from '@/lib/events/time';
import { getCoverImageUrl } from '@/lib/storage-urls';
import { createClient } from '@/lib/supabase/server';

// ============================================
// STATUS BADGE
// ============================================

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-muted text-muted-foreground' },
    active: { label: 'Active', color: 'bg-success/10 text-success dark:bg-success/20' },
    closed: { label: 'Closed', color: 'bg-warning/10 text-warning dark:bg-warning/20' },
    archived: { label: 'Archived', color: 'bg-destructive/10 text-destructive dark:bg-destructive/20' },
    expired: { label: 'Expired', color: 'bg-warning/10 text-warning dark:bg-warning/20' },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// ============================================
// EVENTS PAGE
// ============================================

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Fetch events with media count
  const { data: events } = await supabase
    .from('events')
    .select(
      `
      *,
      media:media(count),
      event_pricing(*)
    `
    )
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false });

  const formattedEvents =
    events?.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description,
      location: event.location,
      eventDate: event.event_date,
      eventStartAtUtc: event.event_start_at_utc,
      eventTimezone: event.event_timezone,
      status: event.status,
      isPublic: event.is_public,
      coverImageUrl: getCoverImageUrl(event.cover_image_url || event.cover_image_path),
      photoCount: event.media?.[0]?.count || 0,
      pricing: event.event_pricing?.[0],
      createdAt: event.created_at,
    })) || [];

  return (
    <div className="space-y-6">
      <EventsListRealtime photographerId={user.id} />
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your photo events and galleries
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/events/new">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Link>
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="events-search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="Search events..."
            className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Events Grid */}
      {formattedEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 py-16">
          <div className="rounded-full bg-muted p-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium text-foreground">No events yet</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Create your first event to start uploading photos
            <br />
            and sharing them with attendees.
          </p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/events/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Event
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {formattedEvents.map((event) => (
            <div
              key={event.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-accent/50 hover:shadow-md"
            >
              {/* Cover Image */}
              <div className="relative aspect-[4/3] bg-gradient-to-br from-accent/10 to-accent/20 overflow-hidden">
                {event.coverImageUrl ? (
                  <img
                    src={event.coverImageUrl}
                    alt={event.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Calendar className="h-12 w-12 text-accent/40" />
                  </div>
                )}
                {/* Status Badge */}
                <div className="absolute right-3 top-3">
                  <StatusBadge status={event.status} />
                </div>
              </div>

              {/* Content */}
              <div className="p-3">
                <h3 className="font-semibold text-sm text-foreground group-hover:text-accent line-clamp-1">
                  {event.name}
                </h3>
                {event.description && (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{event.description}</p>
                )}

                {/* Meta */}
                <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Image className="h-3 w-3" />
                    <span>{event.photoCount} photos</span>
                  </div>
                  {event.eventDate && (
                    <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {formatEventDateDisplay(
                            {
                              event_date: event.eventDate,
                              event_start_at_utc: event.eventStartAtUtc,
                              event_timezone: event.eventTimezone,
                            },
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {event.pricing?.is_free ? (
                    <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success dark:bg-success/20">
                      Free
                    </span>
                  ) : (
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent dark:bg-accent/20">
                      {getCurrencySymbol(event.pricing?.currency || 'USD')}{((event.pricing?.price_per_media || 0) / 100).toFixed(2)}
                    </span>
                  )}
                  {event.isPublic && (
                    <span className="rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                      Public
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="text-sm font-medium text-accent hover:text-accent/80"
                >
                  Manage Event
                </Link>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/e/${event.id}`}
                    target="_blank"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Preview public event page"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/dashboard/events/${event.id}/settings`}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit event settings"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <DeleteEventButton eventId={event.id} eventName={event.name} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
