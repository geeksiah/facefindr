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
        templateCode: notification.templateCode,
        category: notification.category,
        title: notification.subject || 'Notification',
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt ? notification.readAt.toISOString() : null,
        actionUrl: notification.actionUrl,
        details: notification.details || {},
        dedupeKey: notification.dedupeKey || null,
        actor: notification.actorUserId ? { id: notification.actorUserId } : null,
        // Backward-compatible aliases
        channel: notification.channel,
        subject: notification.subject,
        status: notification.status,
        metadata: notification.metadata,
        read_at: notification.readAt ? notification.readAt.toISOString() : null,
        created_at: notification.createdAt.toISOString(),
        template_code: notification.templateCode,
        action_url: notification.actionUrl,
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

// DELETE - Delete notification(s)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const notificationId = typeof body.notificationId === 'string' ? body.notificationId : null;
    const clearAll = body.clearAll === true;

    if (!notificationId && !clearAll) {
      return NextResponse.json(
        { error: 'notificationId or clearAll=true is required' },
        { status: 400 }
      );
    }

    let query = supabase.from('notifications').delete().eq('user_id', user.id);
    if (notificationId) {
      query = query.eq('id', notificationId);
    }

    const { error } = await query;
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Notifications DELETE error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete notification(s)' },
      { status: 500 }
    );
  }
}

