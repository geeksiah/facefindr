import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await hasPermission('disputes.view'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = asString(searchParams.get('status'));
    const search = asString(searchParams.get('search')).toLowerCase();

    let query = supabaseAdmin
      .from('support_tickets')
      .select('id, creator_id, creator_user_id, subject, status, priority, last_message_at, created_at, updated_at')
      .order('last_message_at', { ascending: false });

    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      query = query.eq('status', status as any);
    }

    const { data: tickets, error: ticketsError } = await query;
    if (ticketsError) {
      throw ticketsError;
    }

    const creatorIds = [...new Set((tickets || []).map((ticket: any) => ticket.creator_id).filter(Boolean))];
    let creatorsById = new Map<string, any>();
    if (creatorIds.length > 0) {
      const { data: creators, error: creatorsError } = await supabaseAdmin
        .from('photographers')
        .select('id, display_name, email, profile_photo_url, face_tag')
        .in('id', creatorIds);
      if (creatorsError) {
        throw creatorsError;
      }
      creatorsById = new Map((creators || []).map((creator: any) => [creator.id, creator]));
    }

    const items = (tickets || []).map((ticket: any) => ({
      ...ticket,
      creator: creatorsById.get(ticket.creator_id) || null,
    }));

    const filtered =
      search.length > 0
        ? items.filter((ticket: any) => {
            const creatorName = String(ticket.creator?.display_name || '').toLowerCase();
            const creatorEmail = String(ticket.creator?.email || '').toLowerCase();
            const subjectText = String(ticket.subject || '').toLowerCase();
            return (
              creatorName.includes(search) ||
              creatorEmail.includes(search) ||
              subjectText.includes(search)
            );
          })
        : items;

    return NextResponse.json({ tickets: filtered });
  } catch (error) {
    console.error('Admin support tickets GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load support tickets' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
