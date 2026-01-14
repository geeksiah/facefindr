import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data } = await supabaseAdmin
      .from('platform_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    return NextResponse.json({ announcements: data || [] });
  } catch (error) {
    console.error('Get announcements error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('announcements.create'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, target, send_email, send_push } = body;

    const { data, error } = await supabaseAdmin
      .from('platform_announcements')
      .insert({
        title,
        content,
        target,
        send_email,
        send_push,
        status: 'draft',
        created_by: session.adminId,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction('announcement_create', 'announcement', data.id, { title, target });

    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error('Create announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
