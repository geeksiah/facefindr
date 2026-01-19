import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, delete sent announcements older than 24 hours (auto-cleanup)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    await supabaseAdmin
      .from('platform_announcements')
      .delete()
      .eq('status', 'sent')
      .lt('sent_at', twentyFourHoursAgo);

    // Fetch remaining announcements
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
    const { title, content, target, send_email, send_push, send_sms, country_code } = body;

    if (!send_email && !send_push && !send_sms) {
      return NextResponse.json(
        { error: 'Select at least one channel (email, push, or SMS)' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('platform_announcements')
      .insert({
        title,
        content,
        target,
        send_email,
        send_push,
        send_sms,
        country_code: country_code ? country_code.toUpperCase() : null,
        status: 'draft',
        created_by: session.adminId,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction('announcement_create', 'announcement', data.id, {
      title,
      target,
      country_code: country_code ? country_code.toUpperCase() : null,
      channels: { send_email, send_push, send_sms },
    });

    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error('Create announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
