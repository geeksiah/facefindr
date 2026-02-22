'use client';

import {
  Bell,
  BellOff,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Image,
  Loader2,
  MessageCircle,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type NotificationCategory = 'transactions' | 'photos' | 'orders' | 'social' | 'system' | 'marketing';

interface Notification {
  id: string;
  templateCode: string;
  category: NotificationCategory;
  title: string;
  message: string;
  actionUrl: string | null;
  details: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

interface NotificationSettings {
  photoMatches: boolean;
  newEvents: boolean;
  eventUpdates: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

function categoryIcon(category: NotificationCategory) {
  switch (category) {
    case 'photos':
      return Image;
    case 'social':
      return Calendar;
    case 'transactions':
    case 'orders':
      return CreditCard;
    case 'marketing':
      return Camera;
    default:
      return Bell;
  }
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function detailsRows(details: Record<string, unknown>) {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = details[key];
      if (value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }
    return null;
  };

  return [
    { label: 'Tip message', value: get('message', 'tipMessage') },
    { label: 'Rating', value: get('rating') },
    { label: 'Review', value: get('reviewText', 'review_text') },
    { label: 'Amount', value: get('amount') },
    { label: 'Currency', value: get('currency') },
    { label: 'Reference', value: get('transactionId', 'transaction_id', 'orderId', 'order_id') },
    { label: 'Event', value: get('eventName', 'event_name', 'eventId', 'event_id') },
    { label: 'Profile', value: get('profileName', 'profileSlug', 'profile_slug') },
  ].filter((row) => row.value);
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    photoMatches: true,
    newEvents: true,
    eventUpdates: true,
    emailNotifications: true,
    pushNotifications: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'settings'>('all');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const notifResponse = await fetch('/api/notifications?limit=100');
        if (notifResponse.ok) {
          const data = await notifResponse.json();
          const mapped = (data.notifications || []).map((item: any) => ({
            id: item.id,
            templateCode: item.templateCode || item.template_code || 'system',
            category: (item.category || 'system') as NotificationCategory,
            title: item.title || item.subject || 'Notification',
            message: item.body || '',
            actionUrl: item.actionUrl || item.action_url || null,
            details: item.details || {},
            isRead: Boolean(item.readAt || item.read_at),
            createdAt: item.createdAt || item.created_at || new Date().toISOString(),
          })) as Notification[];
          setNotifications(mapped);
        }

        const settingsResponse = await fetch('/api/attendee/notification-settings');
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          setSettings(data);
        }
      } catch (error) {
        console.error('Failed to fetch notification data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchData();
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  );

  const markAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item))
    );
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    const previous = notifications;
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
      setNotifications(previous);
    }
  };

  const clearAllNotifications = async () => {
    if (!notifications.length) return;
    setIsClearingAll(true);
    const previous = notifications;
    setNotifications([]);
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!response.ok) {
        throw new Error('Failed to clear notifications');
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      setNotifications(previous);
    } finally {
      setIsClearingAll(false);
    }
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      await fetch('/api/attendee/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (error) {
      console.error('Failed to update notification setting:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      void markAsRead(notification.id);
    }

    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      return;
    }

    setSelectedNotification(notification);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && <p className="text-secondary mt-1">{unreadCount} unread</p>}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Check className="mr-2 h-4 w-4" />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllNotifications} disabled={isClearingAll}>
              {isClearingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="flex rounded-xl bg-muted p-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'
          }`}
        >
          All Notifications
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'settings' ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'
          }`}
        >
          Settings
        </button>
      </div>

      {activeTab === 'all' && (
        <>
          {notifications.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = categoryIcon(notification.category);
                return (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-3 p-4 transition-colors ${
                      !notification.isRead ? 'bg-accent/5' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="flex min-w-0 flex-1 items-start gap-4 text-left"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          !notification.isRead ? 'bg-accent/10' : 'bg-muted'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            !notification.isRead ? 'text-accent' : 'text-secondary'
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p
                              className={`font-medium ${
                                !notification.isRead ? 'text-foreground' : 'text-secondary'
                              }`}
                            >
                              {notification.title}
                            </p>
                            <p className="mt-0.5 text-sm text-secondary">{notification.message}</p>
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        <span className="mt-2 inline-flex items-center gap-1 text-sm text-accent">
                          {notification.actionUrl ? 'Open link' : 'Read details'}
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </button>

                    <div className="flex items-center gap-1">
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="p-2 text-secondary hover:text-foreground transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-2 text-secondary hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BellOff className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mb-3 text-xl font-semibold text-foreground">No notifications</h2>
              <p className="mx-auto max-w-md text-secondary">
                You&apos;re all caught up. We&apos;ll notify you when new activity is available.
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">Photo Matches</p>
                <p className="text-sm text-secondary">Get notified when we find your photos.</p>
              </div>
              <Switch checked={settings.photoMatches} onCheckedChange={(checked) => updateSetting('photoMatches', checked)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">New Events</p>
                <p className="text-sm text-secondary">Updates on new events from creators you follow.</p>
              </div>
              <Switch checked={settings.newEvents} onCheckedChange={(checked) => updateSetting('newEvents', checked)} />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">Event Updates</p>
                <p className="text-sm text-secondary">Updates from events where you participate.</p>
              </div>
              <Switch checked={settings.eventUpdates} onCheckedChange={(checked) => updateSetting('eventUpdates', checked)} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 px-1 text-sm font-medium text-secondary">Delivery Methods</h3>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-foreground">Email</p>
                  <p className="text-sm text-secondary">Receive notifications by email.</p>
                </div>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-foreground">Push Notifications</p>
                  <p className="text-sm text-secondary">Receive browser push notifications.</p>
                </div>
                <Switch
                  checked={settings.pushNotifications}
                  onCheckedChange={(checked) => updateSetting('pushNotifications', checked)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{selectedNotification.title}</h3>
                <p className="mt-1 text-sm text-secondary">{selectedNotification.message}</p>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="rounded-lg p-1 text-secondary hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 rounded-xl bg-muted/50 p-4">
              {detailsRows(selectedNotification.details).length > 0 ? (
                detailsRows(selectedNotification.details).map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
                    <span className="text-secondary">{row.label}</span>
                    <span className="text-right text-foreground">{row.value}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-sm text-secondary">
                  <MessageCircle className="h-4 w-4" />
                  No additional details for this notification.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
