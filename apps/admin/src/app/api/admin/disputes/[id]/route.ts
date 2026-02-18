import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const DISPUTE_STATUSES = new Set([
  'open',
  'under_review',
  'evidence_submitted',
  'won',
  'lost',
  'closed',
]);

export async function GET(
  request: NextRequest,
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

    const { data: dispute, error } = await supabaseAdmin
      .from('disputes')
      .select(`
        *,
        transactions (
          id,
          gross_amount,
          net_amount,
          currency,
          payment_provider,
          status,
          created_at,
          event_id,
          attendee_id,
          events (id, name, event_date),
          attendees:attendee_id (id, display_name, face_tag)
        ),
        assigned_admin:assigned_to (id, name, email)
      `)
      .eq('id', params.id)
      .single();

    if (error || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    const { data: admins } = await supabaseAdmin
      .from('admin_users')
      .select('id, name, email, role, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    return NextResponse.json({
      dispute,
      admins: admins || [],
    });
  } catch (error) {
    console.error('Get dispute detail error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
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

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      if (!DISPUTE_STATUSES.has(String(body.status))) {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === 'evidence_submitted') {
        updates.evidence_submitted_at = new Date().toISOString();
      }
    }

    if (body.assigned_to !== undefined) {
      updates.assigned_to = body.assigned_to || null;
    }

    if (body.notes !== undefined) {
      updates.notes = String(body.notes || '').trim();
    }

    if (body.outcome !== undefined) {
      updates.outcome = body.outcome || null;
    }

    if (body.outcome_reason !== undefined) {
      updates.outcome_reason = body.outcome_reason || null;
    }

    if (body.evidence !== undefined) {
      updates.evidence = body.evidence || {};
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: dispute, error } = await supabaseAdmin
      .from('disputes')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error || !dispute) {
      console.error('Update dispute error:', error);
      return NextResponse.json({ error: 'Failed to update dispute' }, { status: 500 });
    }

    await logAction('dispute_update', 'dispute', params.id, {
      updated_fields: Object.keys(updates),
      status: updates.status,
      assigned_to: updates.assigned_to,
    });

    return NextResponse.json({ success: true, dispute });
  } catch (error) {
    console.error('Patch dispute detail error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
