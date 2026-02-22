export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

function normalizePriority(value: unknown): TicketPriority {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'high') return 'high';
  if (normalized === 'urgent') return 'urgent';
  return 'normal';
}

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: tickets, error: ticketsError } = await serviceClient
      .from('support_tickets')
      .select('id, subject, status, priority, last_message_at, created_at, updated_at')
      .eq('creator_user_id', user.id)
      .order('last_message_at', { ascending: false });
    if (ticketsError) {
      throw ticketsError;
    }

    const ticketIds = (tickets || []).map((ticket: any) => ticket.id);
    let messageRows: any[] = [];
    if (ticketIds.length > 0) {
      const { data: messages, error: messagesError } = await serviceClient
        .from('support_ticket_messages')
        .select('ticket_id, sender_type, message, created_at')
        .in('ticket_id', ticketIds)
        .order('created_at', { ascending: false });
      if (messagesError) {
        throw messagesError;
      }
      messageRows = messages || [];
    }

    const latestByTicket = new Map<string, any>();
    for (const row of messageRows) {
      if (!latestByTicket.has(row.ticket_id)) {
        latestByTicket.set(row.ticket_id, row);
      }
    }

    return NextResponse.json({
      tickets: (tickets || []).map((ticket: any) => ({
        ...ticket,
        latestMessage: latestByTicket.get(ticket.id) || null,
      })),
    });
  } catch (error: any) {
    console.error('Creator support tickets GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load support tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => ({}));
    const subject = String(payload?.subject || '').trim();
    const message = String(payload?.message || '').trim();
    const priority = normalizePriority(payload?.priority);

    if (!subject || subject.length < 3) {
      return NextResponse.json(
        { error: 'Subject must be at least 3 characters' },
        { status: 400 }
      );
    }
    if (!message || message.length < 5) {
      return NextResponse.json(
        { error: 'Message must be at least 5 characters' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { data: ticket, error: ticketError } = await serviceClient
      .from('support_tickets')
      .insert({
        creator_id: creatorProfile.id,
        creator_user_id: user.id,
        subject,
        priority,
        status: 'open',
        last_message_at: nowIso,
      })
      .select('id, subject, status, priority, last_message_at, created_at, updated_at')
      .single();
    if (ticketError || !ticket) {
      throw ticketError || new Error('Failed to create support ticket');
    }

    const { error: messageError } = await serviceClient
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'creator',
        sender_id: user.id,
        message,
        is_internal: false,
      });
    if (messageError) {
      throw messageError;
    }

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error('Creator support tickets POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create support ticket' },
      { status: 500 }
    );
  }
}
