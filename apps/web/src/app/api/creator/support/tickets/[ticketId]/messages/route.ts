export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function resolveOwnedTicket(
  serviceClient: ReturnType<typeof createServiceClient>,
  ticketId: string,
  creatorUserId: string
) {
  return serviceClient
    .from('support_tickets')
    .select('id, status, creator_user_id')
    .eq('id', ticketId)
    .eq('creator_user_id', creatorUserId)
    .maybeSingle();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticketId = String(params.ticketId || '').trim();
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: ticket } = await resolveOwnedTicket(serviceClient, ticketId, user.id);
    if (!ticket?.id) {
      return NextResponse.json({ error: 'Support ticket not found' }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await serviceClient
      .from('support_ticket_messages')
      .select('id, sender_type, sender_id, message, is_internal, created_at')
      .eq('ticket_id', ticket.id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true });
    if (messagesError) {
      throw messagesError;
    }

    return NextResponse.json({
      ticket,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error('Creator support messages GET error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load support messages' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { ticketId: string } }
) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticketId = String(params.ticketId || '').trim();
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const { data: ticket } = await resolveOwnedTicket(serviceClient, ticketId, user.id);
    if (!ticket?.id) {
      return NextResponse.json({ error: 'Support ticket not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => ({}));
    const message = String(payload?.message || '').trim();
    if (!message || message.length < 2) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await serviceClient
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'creator',
        sender_id: user.id,
        message,
        is_internal: false,
      })
      .select('id, sender_type, sender_id, message, is_internal, created_at')
      .single();
    if (insertError || !inserted) {
      throw insertError || new Error('Failed to create support message');
    }

    await serviceClient
      .from('support_tickets')
      .update({
        status: ticket.status === 'closed' ? 'open' : ticket.status,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', ticket.id);

    return NextResponse.json({
      success: true,
      message: inserted,
    });
  } catch (error: any) {
    console.error('Creator support messages POST error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create support message' },
      { status: 500 }
    );
  }
}
