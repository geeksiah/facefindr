'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PhotoUploader } from '@/components/events/photo-uploader';
import { Button } from '@/components/ui/button';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { formatEventDateDisplay } from '@/lib/events/time';
import { createClient } from '@/lib/supabase/client';

interface Event {
  id: string;
  name: string;
  event_date: string | null;
  event_start_at_utc: string | null;
  event_timezone: string | null;
  status: string;
  media_count?: number;
}

export default function UploadPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [creatorFallbackId, setCreatorFallbackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: userRes, error: userError } = await supabase.auth.getUser();

      if (userError || !userRes.user) {
        router.push('/login');
        return;
      }

      const authUserId = userRes.user.id;
      let currentCreatorId = authUserId;
      const creatorByUserId = await supabase
        .from('photographers')
        .select('id')
        .eq('user_id', authUserId)
        .maybeSingle();
      const missingUserIdColumn =
        creatorByUserId.error?.code === '42703' ||
        String(creatorByUserId.error?.message || '').includes('user_id');
      if (!creatorByUserId.error && creatorByUserId.data?.id) {
        currentCreatorId = creatorByUserId.data.id;
      } else if (!missingUserIdColumn) {
        const creatorById = await supabase
          .from('photographers')
          .select('id')
          .eq('id', authUserId)
          .maybeSingle();
        if (creatorById.data?.id) {
          currentCreatorId = creatorById.data.id;
        }
      }

      const creatorIdCandidates = Array.from(new Set([authUserId, currentCreatorId]));
      setCreatorId(currentCreatorId);
      setCreatorFallbackId(authUserId !== currentCreatorId ? authUserId : null);

      const [{ data: ownedEventsRes, error: ownedEventsError }, { data: collaboratorRows, error: collaboratorError }] = await Promise.all([
        supabase
        .from('events')
        .select('id, name, event_date, event_timezone, status')
          .in('photographer_id', creatorIdCandidates)
          .in('status', ['draft', 'active', 'closed'])
          .order('created_at', { ascending: false }),
        supabase
          .from('event_collaborators')
          .select('event_id')
          .in('photographer_id', creatorIdCandidates)
          .eq('status', 'active'),
      ]);

      if (ownedEventsError) {
        console.error('Error loading owned events:', ownedEventsError);
        setEvents([]);
        return;
      }

      if (collaboratorError) {
        console.error('Error loading collaborator events:', collaboratorError);
      }

      const collaboratorEventIds = (collaboratorRows ?? []).map((row) => row.event_id).filter(Boolean);
      let collaboratorEvents: Event[] = [];
      if (collaboratorEventIds.length > 0) {
        const { data: collaboratorEventsRes, error: collaboratorEventsError } = await supabase
          .from('events')
          .select('id, name, event_date, event_timezone, status')
          .in('id', collaboratorEventIds)
          .in('status', ['draft', 'active', 'closed'])
          .order('created_at', { ascending: false });

        if (collaboratorEventsError) {
          console.error('Error loading collaborator event details:', collaboratorEventsError);
        } else {
          collaboratorEvents = (collaboratorEventsRes ?? []) as Event[];
        }
      }

      const eventMap = new Map<string, Event>();
      for (const event of (ownedEventsRes ?? []) as Event[]) {
        eventMap.set(event.id, event);
      }
      for (const event of collaboratorEvents) {
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, event);
        }
      }
      const eventsList = Array.from(eventMap.values());

      if (eventsList.length === 0) {
        setEvents([]);
        return;
      }

      // Get media counts separately for each event
      const eventIds = eventsList.map((e) => e.id);
      const { data: mediaCounts, error: mediaError } = await supabase
        .from('media')
        .select('event_id')
        .in('event_id', eventIds);

      if (mediaError) {
        console.error('Error loading media counts:', mediaError);
      }

      const counts = new Map<string, number>();
      mediaCounts?.forEach((m) => {
        counts.set(m.event_id, (counts.get(m.event_id) || 0) + 1);
      });

      setEvents(
        eventsList.map((e) => ({
          id: e.id,
          name: e.name,
          event_date: e.event_date,
          event_start_at_utc: e.event_start_at_utc,
          event_timezone: e.event_timezone,
          status: e.status,
          media_count: counts.get(e.id) || 0,
        }))
      );

      setSelectedEventId((prev) => (prev && !eventMap.has(prev) ? null : prev));
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Subscribe to real-time updates for events
  useRealtimeSubscription({
    table: 'events',
    filter: creatorId
      ? `photographer_id=eq.${creatorId}`
      : 'photographer_id=eq.00000000-0000-0000-0000-000000000000',
    onChange: loadEvents,
  });
  useRealtimeSubscription({
    table: 'events',
    filter: creatorFallbackId
      ? `photographer_id=eq.${creatorFallbackId}`
      : 'photographer_id=eq.00000000-0000-0000-0000-000000000000',
    onChange: loadEvents,
  });

  useRealtimeSubscription({
    table: 'event_collaborators',
    filter: creatorId
      ? `photographer_id=eq.${creatorId}`
      : 'photographer_id=eq.00000000-0000-0000-0000-000000000000',
    onChange: loadEvents,
  });
  useRealtimeSubscription({
    table: 'event_collaborators',
    filter: creatorFallbackId
      ? `photographer_id=eq.${creatorFallbackId}`
      : 'photographer_id=eq.00000000-0000-0000-0000-000000000000',
    onChange: loadEvents,
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-44 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4">
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload Photos</h1>
        <p className="mt-1 text-muted-foreground">
          Select an event and upload your photos
        </p>
      </div>

      {/* Event Selection */}
      {!selectedEventId ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Select an Event</h2>

          {events.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <div className="mx-auto rounded-2xl bg-muted p-4 w-fit mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No events yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create an event before uploading photos.
              </p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/events/new">Create Event</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-accent/50 hover:shadow-sm group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate group-hover:text-accent transition-colors">
                      {event.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {event.event_date && (
                        <span>
                          {formatEventDateDisplay(
                            {
                              event_date: event.event_date,
                              event_start_at_utc: event.event_start_at_utc,
                              event_timezone: event.event_timezone,
                            },
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                      )}
                      <span>{event.media_count} photos</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected Event Header */}
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => setSelectedEventId(null)}
                className="text-sm text-muted-foreground hover:text-foreground mb-1"
              >
                {'<- Back to events'}
              </button>
              <h2 className="text-lg font-semibold text-foreground">
                {events.find((e) => e.id === selectedEventId)?.name}
              </h2>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/events/${selectedEventId}`}>View Event</Link>
            </Button>
          </div>

          {/* Uploader */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <PhotoUploader
              eventId={selectedEventId}
              onUploadComplete={() => {
                // Refresh event data
                router.refresh();
                loadEvents();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
