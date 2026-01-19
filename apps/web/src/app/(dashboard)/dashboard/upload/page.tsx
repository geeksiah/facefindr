'use client';

import { useState, useEffect } from 'react';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { useRouter } from 'next/navigation';
import { Upload, Calendar, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { PhotoUploader } from '@/components/events/photo-uploader';
import { createClient } from '@/lib/supabase/client';

interface Event {
  id: string;
  name: string;
  event_date: string | null;
  status: string;
  media_count: number;
}

export default function UploadPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      try {
        const supabase = createClient();
        const { data: user, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user.user) {
          router.push('/login');
          return;
        }

        const { data: events, error: eventsError } = await supabase
          .from('events')
          .select('id, name, event_date, status')
          .eq('photographer_id', user.user.id)
          .in('status', ['draft', 'active'])
          .order('created_at', { ascending: false });

        if (eventsError) {
          console.error('Error loading events:', eventsError);
          setLoading(false);
          return;
        }

        // Get media counts separately for each event
        if (events && events.length > 0) {
          const eventIds = events.map(e => e.id);
          const { data: mediaCounts } = await supabase
            .from('media')
            .select('event_id')
            .in('event_id', eventIds);

          // Count media per event
          const counts = new Map<string, number>();
          mediaCounts?.forEach((m) => {
            counts.set(m.event_id, (counts.get(m.event_id) || 0) + 1);
          });

          setEvents(
            events.map((e) => ({
              id: e.id,
              name: e.name,
              event_date: e.event_date,
              status: e.status,
              media_count: counts.get(e.id) || 0,
            }))
          );
        } else {
          setEvents([]);
        }
      } catch (error) {
        console.error('Error loading events:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadEvents();
  }, [router]);

  // Subscribe to real-time updates for events
  useRealtimeSubscription({
    table: 'events',
    onChange: () => {
      loadEvents();
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
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
                          {new Date(event.event_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
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
                ← Back to events
              </button>
              <h2 className="text-lg font-semibold text-foreground">
                {events.find((e) => e.id === selectedEventId)?.name}
              </h2>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/events/${selectedEventId}`}>
                View Event
              </Link>
            </Button>
          </div>

          {/* Uploader */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <PhotoUploader 
              eventId={selectedEventId} 
              onUploadComplete={() => {
                // Refresh event data
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
