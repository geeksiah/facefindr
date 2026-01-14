import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('announcements.send'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;

    // Get announcement
    const { data: announcement, error } = await supabaseAdmin
      .from('platform_announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    // Get target users
    let userCount = 0;
    
    if (announcement.target === 'all' || announcement.target === 'photographers') {
      const { count } = await supabaseAdmin
        .from('photographers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      userCount += count || 0;
    }

    if (announcement.target === 'all' || announcement.target === 'attendees') {
      const { count } = await supabaseAdmin
        .from('attendees')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      userCount += count || 0;
    }

    // Update announcement as sent
    await supabaseAdmin
      .from('platform_announcements')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_count: userCount,
      })
      .eq('id', id);

    // In production, you would queue notifications here
    // For now, we just mark it as sent

    await logAction('announcement_send', 'announcement', id, { 
      target: announcement.target,
      sent_count: userCount,
    });

    return NextResponse.json({ success: true, sent_count: userCount });
  } catch (error) {
    console.error('Send announcement error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
