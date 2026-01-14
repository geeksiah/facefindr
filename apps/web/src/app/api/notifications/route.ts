/**
 * Notifications API
 * 
 * Get user notifications and manage read status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from '@/lib/notifications';

// GET - Get user notifications
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const count = await getUnreadCount(user.id);
      return NextResponse.json({ unreadCount: count });
    }

    const notifications = await getUserNotifications(user.id, { limit, unreadOnly });
    const unreadCount = await getUnreadCount(user.id);

    return NextResponse.json({
      notifications,
      unreadCount,
    });

  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    );
  }
}

// POST - Mark notification(s) as read
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      const count = await markAllNotificationsAsRead(user.id);
      return NextResponse.json({ success: true, markedCount: count });
    }

    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID required' },
        { status: 400 }
      );
    }

    const success = await markNotificationAsRead(user.id, notificationId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to mark as read' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}
