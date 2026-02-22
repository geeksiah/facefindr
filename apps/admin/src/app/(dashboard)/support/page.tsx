'use client';

import { Loader2, MessageSquare, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  creator: {
    id: string;
    display_name: string | null;
    email: string | null;
    face_tag: string | null;
    profile_photo_url: string | null;
  } | null;
}

interface SupportMessage {
  id: string;
  sender_type: 'creator' | 'admin' | 'system';
  sender_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [internalOnly, setInternalOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (statusFilter !== 'all') query.set('status', statusFilter);
      if (search.trim()) query.set('search', search.trim());
      const response = await fetch(`/api/admin/support/tickets?${query.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load support tickets');
      }

      const loadedTickets = (payload.tickets || []) as SupportTicket[];
      setTickets(loadedTickets);
      if (!selectedTicketId && loadedTickets.length > 0) {
        setSelectedTicketId(loadedTickets[0].id);
      } else if (selectedTicketId && !loadedTickets.some((ticket) => ticket.id === selectedTicketId)) {
        setSelectedTicketId(loadedTickets[0]?.id || null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load support tickets');
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    setIsLoadingMessages(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}/messages`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load support conversation');
      }
      setMessages((payload.messages || []) as SupportMessage[]);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load support conversation');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [statusFilter]);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedTicketId);
  }, [selectedTicketId]);

  const updateTicket = async (updates: Partial<Pick<SupportTicket, 'status' | 'priority'>>) => {
    if (!selectedTicket) return;
    setIsUpdatingTicket(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update ticket');
      }
      await loadTickets();
    } catch (updateError: any) {
      setError(updateError?.message || 'Failed to update ticket');
    } finally {
      setIsUpdatingTicket(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setIsSendingReply(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText.trim(),
          isInternal: internalOnly,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send reply');
      }
      setReplyText('');
      setInternalOnly(false);
      await Promise.all([loadMessages(selectedTicket.id), loadTickets()]);
    } catch (sendError: any) {
      setError(sendError?.message || 'Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reply to creator support requests and update ticket status.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search creator or subject"
              className="flex-1 rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={() => void loadTickets()}
              className="rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted"
            >
              Search
            </button>
          </div>

          <div className="mb-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as any)}
              className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {isLoadingTickets ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No support tickets found.
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    selectedTicketId === ticket.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-muted/60'
                  }`}
                >
                  <p className="line-clamp-1 text-sm font-medium text-foreground">{ticket.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(ticket.creator?.display_name || 'Creator')} • {ticket.status.replace('_', ' ')} •{' '}
                    {new Date(ticket.last_message_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          {!selectedTicket ? (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
              Select a ticket to view conversation.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Creator</p>
                  <p className="text-sm text-foreground">
                    {selectedTicket.creator?.display_name || 'Creator'} ({selectedTicket.creator?.email || 'No email'})
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Ticket</p>
                  <p className="text-sm text-foreground line-clamp-1">{selectedTicket.subject}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-foreground">
                  Status
                  <select
                    value={selectedTicket.status}
                    disabled={isUpdatingTicket}
                    onChange={(event) => void updateTicket({ status: event.target.value as TicketStatus })}
                    className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="text-sm text-foreground">
                  Priority
                  <select
                    value={selectedTicket.priority}
                    disabled={isUpdatingTicket}
                    onChange={(event) => void updateTicket({ priority: event.target.value as TicketPriority })}
                    className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <MessageSquare className="h-4 w-4" />
                  Conversation
                </div>
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-3 text-sm ${
                          message.sender_type === 'admin'
                            ? 'border-primary/30 bg-primary/10'
                            : message.is_internal
                            ? 'border-warning/30 bg-warning/10'
                            : 'border-border bg-card'
                        }`}
                      >
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          {message.sender_type}
                          {message.is_internal ? ' • internal' : ''}
                        </p>
                        <p className="whitespace-pre-wrap text-foreground">{message.message}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="Type your reply..."
                  rows={4}
                  className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
                />
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={internalOnly}
                    onChange={(event) => setInternalOnly(event.target.checked)}
                  />
                  Internal note (hidden from creator)
                </label>
                <button
                  type="button"
                  disabled={isSendingReply || !replyText.trim()}
                  onClick={() => void sendReply()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
