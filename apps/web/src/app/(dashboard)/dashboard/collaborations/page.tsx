'use client';

import {
  ArrowLeft,
  Calendar,
  Check,
  Clock3,
  Loader2,
  UserRound,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatEventDateDisplay } from '@/lib/events/time';

interface EventOwner {
  id: string;
  display_name: string;
  face_tag: string | null;
  profile_photo_url: string | null;
}

interface CollaborationEvent {
  id: string;
  name: string;
  event_date: string | null;
  event_start_at_utc: string | null;
  event_timezone: string | null;
  location: string | null;
  status: string;
  cover_image_url: string | null;
  photographers: EventOwner | EventOwner[] | null;
}

interface Collaboration {
  id: string;
  role: 'owner' | 'lead' | 'collaborator' | 'assistant';
  status: 'pending' | 'active' | 'declined' | 'removed';
  can_upload: boolean;
  can_view_all_photos: boolean;
  can_edit_event: boolean;
  can_view_analytics: boolean;
  can_view_revenue: boolean;
  revenue_share_percent: number;
  invited_at: string;
  accepted_at: string | null;
  events: CollaborationEvent | CollaborationEvent[] | null;
}

const roleLabel: Record<Collaboration['role'], string> = {
  owner: 'Owner',
  lead: 'Lead',
  collaborator: 'Collaborator',
  assistant: 'Assistant',
};

function normalizeEvent(raw: Collaboration['events']) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
}

function normalizeOwner(raw: CollaborationEvent['photographers']) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
}

export default function CollaborationsPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadCollaborations = useCallback(async () => {
    try {
      const response = await fetch('/api/collaborations', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load collaborations');
      }
      setCollaborations((data.collaborations || []) as Collaboration[]);
    } catch (error) {
      toast.error(
        'Unable to load',
        error instanceof Error ? error.message : 'Failed to load collaborations'
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCollaborations();
  }, [loadCollaborations]);

  const pending = useMemo(
    () => collaborations.filter((item) => item.status === 'pending'),
    [collaborations]
  );
  const active = useMemo(
    () => collaborations.filter((item) => item.status === 'active'),
    [collaborations]
  );

  const handleInvitationAction = async (collaborationId: string, action: 'accept' | 'decline') => {
    setActingId(collaborationId);
    try {
      const response = await fetch('/api/collaborations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborationId, action }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Failed to ${action} invitation`);
      }

      toast.success(
        action === 'accept' ? 'Invitation accepted' : 'Invitation declined',
        action === 'accept'
          ? 'You now have access to this event workspace.'
          : 'The invitation has been declined.'
      );

      setCollaborations((prev) =>
        prev
          .map((item) => {
            if (item.id !== collaborationId) return item;
            if (action === 'accept') {
              return {
                ...item,
                status: 'active' as Collaboration['status'],
                accepted_at: new Date().toISOString(),
              };
            }
            return { ...item, status: 'declined' as Collaboration['status'] };
          })
          .filter((item) => item.status !== 'declined')
      );
    } catch (error) {
      toast.error(
        'Update failed',
        error instanceof Error ? error.message : 'Could not update invitation'
      );
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
        <div className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Collaborations</h1>
            <p className="text-sm text-muted-foreground">
              Manage invitations and events where you collaborate with other creators.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-warning" />
          <h2 className="font-semibold text-foreground">Pending Invitations ({pending.length})</h2>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => {
              const event = normalizeEvent(item.events);
              const owner = normalizeOwner(event?.photographers || null);
              if (!event) return null;

              return (
                <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{event.name}</p>
                      <p className="text-sm text-muted-foreground">Role: {roleLabel[item.role]}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited {new Date(item.invited_at).toLocaleDateString()}
                      </p>
                      {owner ? (
                        <p className="text-xs text-muted-foreground">
                          Invited by {owner.display_name}
                          {owner.face_tag ? ` (${owner.face_tag})` : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingId === item.id}
                        onClick={() => handleInvitationAction(item.id, 'decline')}
                      >
                        {actingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        disabled={actingId === item.id}
                        onClick={() => handleInvitationAction(item.id, 'accept')}
                      >
                        {actingId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Accept
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold text-foreground">Active Collaborations ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">You are not collaborating on any events yet.</p>
        ) : (
          <div className="space-y-3">
            {active.map((item) => {
              const event = normalizeEvent(item.events);
              const owner = normalizeOwner(event?.photographers || null);
              if (!event) return null;

              return (
                <div key={item.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      {event.cover_image_url ? (
                        <Image
                          src={event.cover_image_url}
                          alt={event.name}
                          width={56}
                          height={56}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                          <Calendar className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{event.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.event_date
                            ? formatEventDateDisplay(
                                {
                                  event_date: event.event_date,
                                  event_start_at_utc: event.event_start_at_utc,
                                  event_timezone: event.event_timezone,
                                },
                                'en-US',
                                { month: 'short', day: 'numeric', year: 'numeric' }
                              )
                            : 'Date not set'}
                          {event.location ? ` • ${event.location}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                            {roleLabel[item.role]}
                          </span>
                          {item.can_upload ? (
                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                              Upload enabled
                            </span>
                          ) : null}
                          {item.can_edit_event ? (
                            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                              Can edit event
                            </span>
                          ) : null}
                        </div>
                        {owner ? (
                          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            {owner.profile_photo_url ? (
                              <Image
                                src={owner.profile_photo_url}
                                alt={owner.display_name}
                                width={18}
                                height={18}
                                className="h-[18px] w-[18px] rounded-full object-cover"
                              />
                            ) : (
                              <UserRound className="h-4 w-4" />
                            )}
                            <span className="truncate">Owner: {owner.display_name}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href={`/dashboard/events/${event.id}`}>Open Event</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
