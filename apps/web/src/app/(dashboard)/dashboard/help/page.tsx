'use client';

import {
  ChevronRight,
  HelpCircle,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const faqs = [
  {
    question: 'How does face recognition work?',
    answer:
      'Our AI analyzes facial features to create a unique signature. When attendees scan their face, we match it against photos from the event to find images featuring them.',
  },
  {
    question: 'Is my biometric data secure?',
    answer:
      'Facial data is encrypted, event-scoped, and retention-governed. We do not expose biometric vectors publicly.',
  },
  {
    question: 'How do I get paid for photo sales?',
    answer:
      'Set up payout details in billing settings. Charges are reconciled through payment verification and finance journals.',
  },
  {
    question: 'What file formats are supported?',
    answer:
      'JPEG, PNG, and WebP are supported in standard upload flows.',
  },
];

interface SupportTicket {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface SupportMessage {
  id: string;
  sender_type: 'creator' | 'admin' | 'system';
  sender_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export default function HelpPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [subject, setSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [replyMessage, setReplyMessage] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const response = await fetch('/api/creator/support/tickets', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load support tickets');
      }

      const loadedTickets = (payload.tickets || []) as SupportTicket[];
      setTickets(loadedTickets);

      const ticketFromQuery = String(searchParams?.get('ticket') || '').trim();
      if (ticketFromQuery && loadedTickets.some((ticket) => ticket.id === ticketFromQuery)) {
        setSelectedTicketId(ticketFromQuery);
        return;
      }

      if (!selectedTicketId && loadedTickets.length > 0) {
        setSelectedTicketId(loadedTickets[0].id);
      } else if (
        selectedTicketId &&
        !loadedTickets.some((ticket) => ticket.id === selectedTicketId)
      ) {
        setSelectedTicketId(loadedTickets[0]?.id || null);
      }
    } catch (error: any) {
      toast.error('Support', error?.message || 'Failed to load support tickets');
      setTickets([]);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/creator/support/tickets/${ticketId}/messages`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load support conversation');
      }
      setMessages((payload.messages || []) as SupportMessage[]);
    } catch (error: any) {
      toast.error('Support', error?.message || 'Failed to load support conversation');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []);

  useEffect(() => {
    if (!selectedTicketId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedTicketId);
  }, [selectedTicketId]);

  const createTicket = async () => {
    if (!subject.trim() || !ticketMessage.trim()) {
      toast.error('Support', 'Subject and message are required');
      return;
    }

    setIsCreatingTicket(true);
    try {
      const response = await fetch('/api/creator/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: ticketMessage.trim(),
          priority,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create support ticket');
      }
      setSubject('');
      setTicketMessage('');
      setPriority('normal');
      toast.success('Support', 'Ticket created successfully');
      await loadTickets();
      if (payload?.ticket?.id) {
        setSelectedTicketId(String(payload.ticket.id));
      }
    } catch (error: any) {
      toast.error('Support', error?.message || 'Failed to create support ticket');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) {
      return;
    }
    setIsSendingReply(true);
    try {
      const response = await fetch(
        `/api/creator/support/tickets/${selectedTicket.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: replyMessage.trim() }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send support reply');
      }
      setReplyMessage('');
      await Promise.all([loadMessages(selectedTicket.id), loadTickets()]);
    } catch (error: any) {
      toast.error('Support', error?.message || 'Failed to send support reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help & Support</h1>
        <p className="mt-1 text-secondary">
          Find answers or open a support ticket.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="rounded-xl bg-accent/10 p-3 w-fit">
            <HelpCircle className="h-6 w-6 text-accent" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">Pricing & Plans</h3>
          <p className="mt-1 text-sm text-secondary">
            Compare plan limits and billing details.
          </p>
          <Button className="mt-4" asChild>
            <a href="/dashboard/billing">Open Billing</a>
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="rounded-xl bg-muted p-3 w-fit">
            <MessageCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">Community Forum</h3>
          <p className="mt-1 text-sm text-secondary">Coming soon.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Frequently Asked Questions</h2>
        </div>
        <div className="divide-y divide-border">
          {faqs.map((faq, index) => (
            <details key={index} className="group">
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none">
                <span className="font-medium text-foreground">{faq.question}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-6 pb-4">
                <p className="text-secondary">{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-accent/10 p-3">
            <Mail className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Contact Support</h2>
            <p className="mt-1 text-sm text-secondary">
              Send a message and track replies in one thread.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px,1fr]">
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold text-foreground">Create New Ticket</h3>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            />
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as any)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea
              value={ticketMessage}
              onChange={(event) => setTicketMessage(event.target.value)}
              placeholder="Describe your issue"
              rows={4}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            />
            <Button onClick={createTicket} disabled={isCreatingTicket}>
              {isCreatingTicket ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Ticket
            </Button>
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Your Tickets</p>
              {isLoadingTickets ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tickets yet.</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                        selectedTicketId === ticket.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-card hover:bg-muted'
                      }`}
                    >
                      <p className="line-clamp-1 font-medium text-foreground">{ticket.subject}</p>
                      <p className="mt-1 text-muted-foreground">
                        {ticket.status.replace('_', ' ')} |{' '}
                        {new Date(ticket.last_message_at).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            {!selectedTicket ? (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                Select a ticket to view replies.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedTicket.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {selectedTicket.status.replace('_', ' ')} | Priority: {selectedTicket.priority}
                  </p>
                </div>
                <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
                  {isLoadingMessages ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-3 text-sm ${
                          message.sender_type === 'admin'
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-border bg-muted/20'
                        }`}
                      >
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          {message.sender_type}
                        </p>
                        <p className="whitespace-pre-wrap text-foreground">{message.message}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {new Date(message.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <textarea
                    value={replyMessage}
                    onChange={(event) => setReplyMessage(event.target.value)}
                    placeholder="Reply to this ticket"
                    rows={3}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
                  />
                  <Button onClick={sendReply} disabled={isSendingReply || !replyMessage.trim()}>
                    {isSendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
