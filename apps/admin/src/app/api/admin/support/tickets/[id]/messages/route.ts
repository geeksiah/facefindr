import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await hasPermission('disputes.view'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const ticketId = asString(params.id);
    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket id is required' }, { status: 400 });
    }

    const { data: ticket } = await supabaseAdmin
      .from('support_tickets')
      .select('id')
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket?.id) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const { data: messages, error } = await supabaseAdmin
      .from('support_ticket_messages')
      .select('id, sender_type, sender_id, message, is_internal, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    console.error('Admin support messages GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load support messages' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await hasPermission('disputes.manage'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const ticketId = asString(params.id);
    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket id is required' }, { status: 400 });
    }

    const payload = await request.json().catch(() => ({}));
    const message = asString(payload?.message);
    const isInternal = payload?.isInternal === true;
    if (!message || message.length < 2) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const { data: ticket } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, status, creator_user_id')
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket?.id) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const { data: insertedMessage, error: insertError } = await supabaseAdmin
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'admin',
        sender_id: session.adminId,
        message,
        is_internal: isInternal,
      })
      .select('id, sender_type, sender_id, message, is_internal, created_at')
      .single();
    if (insertError || !insertedMessage) {
      throw insertError || new Error('Failed to create support message');
    }

    const nowIso = new Date().toISOString();
    const nextStatus =
      ticket.status === 'open' || ticket.status === 'in_progress'
        ? 'in_progress'
        : ticket.status;

    await supabaseAdmin
      .from('support_tickets')
      .update({
        status: nextStatus,
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', ticket.id);

    if (!isInternal && ticket.creator_user_id) {
      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: ticket.creator_user_id,
          template_code: 'support_ticket_reply',
          category: 'system',
          channel: 'in_app',
          subject: 'Support replied to your ticket',
          body: `Admin replied to "${ticket.subject}".`,
          status: 'delivered',
          sent_at: nowIso,
          delivered_at: nowIso,
          action_url: `/dashboard/help?ticket=${ticket.id}`,
          details: {
            ticketId: ticket.id,
            subject: ticket.subject,
            messageId: insertedMessage.id,
          },
          dedupe_key: `support_ticket_reply:${ticket.id}:${insertedMessage.id}`,
        } as any);
      if (notificationError) {
        console.error('Failed to create support reply notification:', notificationError);
      }
    }

    await logAction('support_ticket_reply', 'support_ticket', ticket.id, {
      message_id: insertedMessage.id,
      is_internal: isInternal,
    });

    return NextResponse.json({
      success: true,
      message: insertedMessage,
      status: nextStatus,
    });
  } catch (error) {
    console.error('Admin support messages POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create support message' },
      { status: 500 }
    );
  }
}
