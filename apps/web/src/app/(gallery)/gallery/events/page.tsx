'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  Search,
  Camera,
  Users,
  ChevronRight,
  QrCode,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Event {
  id: string;
  name: string;
  date: string;
  location?: string;
  coverImage?: string;
  photographerName: string;
  totalPhotos: number;
  matchedPhotos: number;
  status: 'active' | 'closed' | 'expired';
}

export default function MyEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/attendee/events');
        if (response.ok) {
          const data = await response.json();
          setEvents(data.events || []);
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const handleJoinEvent = async () => {
    if (!accessCode.trim()) return;

    setIsJoining(true);
    setJoinError(null);

    try {
      const response = await fetch('/api/events/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: accessCode.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid access code');
      }

      // Refresh events list
      const eventsResponse = await fetch('/api/attendee/events');
      if (eventsResponse.ok) {
        const data = await eventsResponse.json();
        setEvents(data.events || []);
      }

      setAccessCode('');
      setShowCodeInput(false);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Failed to join event');
    } finally {
      setIsJoining(false);
    }
  };

  const filteredEvents = events.filter(
    (event) =>
      event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusStyles = {
    active: 'bg-success/10 text-success',
    closed: 'bg-warning/10 text-warning',
    expired: 'bg-muted text-muted-foreground',
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Events</h1>
          <p className="text-secondary mt-1">Events where your photos were found</p>
        </div>
        <Button variant="secondary" onClick={() => setShowCodeInput(!showCodeInput)}>
          <QrCode className="mr-2 h-4 w-4" />
          Enter Event Code
        </Button>
      </div>

      {/* Join Event by Code */}
      {showCodeInput && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-foreground">Join an Event</h3>
            <p className="text-sm text-secondary mt-1">
              Enter the access code provided by the photographer
            </p>
          </div>
          <div className="flex gap-3">
            <Input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="Enter access code"
              className="uppercase font-mono"
              maxLength={12}
            />
            <Button variant="primary" onClick={handleJoinEvent} isLoading={isJoining}>
              Join
            </Button>
          </div>
          {joinError && <p className="text-sm text-destructive">{joinError}</p>}
        </div>
      )}

      {/* Search */}
      {events.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="pl-11"
          />
        </div>
      )}

      {/* Events List */}
      {filteredEvents.length > 0 ? (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <Link
              key={event.id}
              href={`/gallery/events/${event.id}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:shadow-soft hover:border-accent/20"
            >
              {/* Event Cover */}
              {event.coverImage ? (
                <Image
                  src={event.coverImage}
                  alt={event.name}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted flex-shrink-0">
                  <Calendar className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Event Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-foreground truncate">{event.name}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[event.status]}`}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-secondary mt-1">
                  <span>{event.date}</span>
                  {event.location && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm mt-2">
                  <div className="flex items-center gap-1 text-secondary">
                    <Camera className="h-3.5 w-3.5" />
                    <span>{event.photographerName}</span>
                  </div>
                  <div className="flex items-center gap-1 text-accent">
                    <Users className="h-3.5 w-3.5" />
                    <span>{event.matchedPhotos} of {event.totalPhotos} matched</span>
                  </div>
                </div>
              </div>

              <ChevronRight className="h-5 w-5 text-secondary flex-shrink-0" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">No events yet</h2>
          <p className="text-secondary max-w-md mx-auto mb-6">
            {searchQuery
              ? 'No events match your search'
              : "You haven't joined any events yet. Enter an event code or scan your face to find photos."}
          </p>
          {!searchQuery && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="secondary" onClick={() => setShowCodeInput(true)}>
                <QrCode className="mr-2 h-4 w-4" />
                Enter Code
              </Button>
              <Button asChild variant="primary">
                <Link href="/gallery/scan">Scan My Face</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
