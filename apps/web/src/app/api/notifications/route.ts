export const dynamic = 'force-dynamic';

/**
 * Notifications API
 * 
 * Get user notifications and manage read status.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from '@/lib/notifications';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : createClient();
}

// GET - Get user notifications
export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
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
      notifications: notifications.map((notification) => ({
        id: notification.id,
        channel: notification.channel,
        subject: notification.subject,
        body: notification.body,
        status: notification.status,
        metadata: notification.metadata,
        read_at: notification.readAt ? notification.readAt.toISOString() : null,
        created_at: notification.createdAt.toISOString(),
        template_code: notification.templateCode,
        // Backward-compatible aliases for existing clients
        readAt: notification.readAt ? notification.readAt.toISOString() : null,
        createdAt: notification.createdAt.toISOString(),
        templateCode: notification.templateCode,
      })),
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
    const supabase = await getAuthClient(request);
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

