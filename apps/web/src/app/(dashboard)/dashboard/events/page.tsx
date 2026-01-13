import Link from 'next/link';
import {
  Calendar,
  Plus,
  Search,
  Filter,
  Image,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';

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
  const supabase = createClient();
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
      status: event.status,
      isPublic: event.is_public,
      photoCount: event.media?.[0]?.count || 0,
      pricing: event.event_pricing?.[0],
      createdAt: event.created_at,
    })) || [];

  return (
    <div className="space-y-6">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {formattedEvents.map((event) => (
            <div
              key={event.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-accent/50 hover:shadow-md"
            >
              {/* Cover Image Placeholder */}
              <div className="relative aspect-[16/9] bg-gradient-to-br from-accent/10 to-accent/20">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Calendar className="h-12 w-12 text-accent/40" />
                </div>
                {/* Status Badge */}
                <div className="absolute right-3 top-3">
                  <StatusBadge status={event.status} />
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-semibold text-foreground group-hover:text-accent">
                  {event.name}
                </h3>
                {event.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>
                )}

                {/* Meta */}
                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Image className="h-4 w-4" />
                    <span>{event.photoCount} photos</span>
                  </div>
                  {event.eventDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(event.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="mt-3 flex items-center gap-2">
                  {event.pricing?.is_free ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success dark:bg-success/20">
                      Free
                    </span>
                  ) : (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent dark:bg-accent/20">
                      ${((event.pricing?.price_per_media || 0) / 100).toFixed(2)}/photo
                    </span>
                  )}
                  {event.isPublic && (
                    <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
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
                  <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
