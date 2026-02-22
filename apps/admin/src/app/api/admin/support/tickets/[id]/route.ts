import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value: unknown): 'open' | 'in_progress' | 'resolved' | 'closed' | null {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'open') return 'open';
  if (normalized === 'in_progress') return 'in_progress';
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'closed') return 'closed';
  return null;
}

function normalizePriority(value: unknown): 'low' | 'normal' | 'high' | 'urgent' | null {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'normal') return 'normal';
  if (normalized === 'high') return 'high';
  if (normalized === 'urgent') return 'urgent';
  return null;
}

export async function PATCH(
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
    const status = normalizeStatus(payload?.status);
    const priority = normalizePriority(payload?.priority);
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) updatePayload.status = status;
    if (priority) updatePayload.priority = priority;

    if (!status && !priority) {
      return NextResponse.json(
        { error: 'Provide status or priority to update' },
        { status: 400 }
      );
    }

    const { data: existingTicket } = await supabaseAdmin
      .from('support_tickets')
      .select('id, subject, status, priority, creator_user_id')
      .eq('id', ticketId)
      .maybeSingle();

    if (!existingTicket?.id) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const { data: updatedTicket, error: updateError } = await supabaseAdmin
      .from('support_tickets')
      .update(updatePayload)
      .eq('id', ticketId)
      .select('id, subject, status, priority, creator_user_id, last_message_at, updated_at')
      .single();
    if (updateError || !updatedTicket) {
      throw updateError || new Error('Failed to update ticket');
    }

    const statusChanged = status && status !== existingTicket.status;
    if (statusChanged && updatedTicket.creator_user_id) {
      const { error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: updatedTicket.creator_user_id,
          template_code: 'support_ticket_status_updated',
          category: 'system',
          channel: 'in_app',
          subject: 'Support ticket status updated',
          body: `Your support ticket "${updatedTicket.subject}" is now ${updatedTicket.status.replace('_', ' ')}.`,
          status: 'delivered',
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          action_url: `/dashboard/help?ticket=${updatedTicket.id}`,
          details: {
            ticketId: updatedTicket.id,
            status: updatedTicket.status,
            subject: updatedTicket.subject,
          },
          dedupe_key: `support_ticket_status:${updatedTicket.id}:${updatedTicket.status}`,
        } as any);
      if (notificationError) {
        console.error('Failed to create support status notification:', notificationError);
      }
    }

    await logAction('support_ticket_update', 'support_ticket', updatedTicket.id, {
      status: updatedTicket.status,
      priority: updatedTicket.priority,
    });

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (error) {
    console.error('Admin support ticket PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update support ticket' },
      { status: 500 }
    );
  }
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

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('id, creator_id, creator_user_id, subject, status, priority, last_message_at, created_at, updated_at')
      .eq('id', ticketId)
      .maybeSingle();

    if (error) throw error;
    if (!ticket?.id) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const { data: creator } = await supabaseAdmin
      .from('photographers')
      .select('id, display_name, email, profile_photo_url, face_tag')
      .eq('id', ticket.creator_id)
      .maybeSingle();

    return NextResponse.json({
      ticket: {
        ...ticket,
        creator: creator || null,
      },
    });
  } catch (error) {
    console.error('Admin support ticket GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load support ticket' },
      { status: 500 }
    );
  }
}
