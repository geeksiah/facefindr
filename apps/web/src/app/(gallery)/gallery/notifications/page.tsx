'use client';

import {
  Bell,
  BellOff,
  Camera,
  Image,
  Calendar,
  ChevronRight,
  Check,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface Notification {
  id: string;
  type: 'photo_match' | 'new_event' | 'event_update' | 'system';
  title: string;
  message: string;
  eventId?: string;
  eventName?: string;
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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    photoMatches: true,
    newEvents: true,
    eventUpdates: true,
    emailNotifications: true,
    pushNotifications: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'settings'>('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch notifications
        const notifResponse = await fetch('/api/attendee/notifications');
        if (notifResponse.ok) {
          const data = await notifResponse.json();
          setNotifications(data.notifications || []);
        }

        // Fetch settings
        const settingsResponse = await fetch('/api/attendee/notification-settings');
        if (settingsResponse.ok) {
          const data = await settingsResponse.json();
          setSettings(data);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const markAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );

    try {
      await fetch(`/api/attendee/notifications/${notificationId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      await fetch('/api/attendee/notifications/read-all', { method: 'POST' });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

    try {
      await fetch(`/api/attendee/notifications/${notificationId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
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
      console.error('Failed to update setting:', error);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'photo_match':
        return Image;
      case 'new_event':
        return Calendar;
      case 'event_update':
        return Camera;
      default:
        return Bell;
    }
  };

  const formatTime = (dateString: string) => {
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
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-secondary mt-1">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            <Check className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-muted p-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-secondary hover:text-foreground'
          }`}
        >
          All Notifications
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-secondary hover:text-foreground'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Notifications List */}
      {activeTab === 'all' && (
        <>
          {notifications.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`flex items-start gap-4 p-4 transition-colors ${
                      !notification.isRead ? 'bg-accent/5' : ''
                    }`}
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

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p
                            className={`font-medium ${
                              !notification.isRead ? 'text-foreground' : 'text-secondary'
                            }`}
                          >
                            {notification.title}
                          </p>
                          <p className="text-sm text-secondary mt-0.5">
                            {notification.message}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>

                      {notification.eventId && (
                        <Link
                          href={`/gallery/events/${notification.eventId}`}
                          className="inline-flex items-center gap-1 mt-2 text-sm text-accent hover:text-accent/80 transition-colors"
                          onClick={() => markAsRead(notification.id)}
                        >
                          View event
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>

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
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
                <BellOff className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                No notifications
              </h2>
              <p className="text-secondary max-w-md mx-auto">
                You&apos;re all caught up! We&apos;ll notify you when new photos match your face.
              </p>
            </div>
          )}
        </>
      )}

      {/* Settings */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Notification Types */}
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">Photo Matches</p>
                <p className="text-sm text-secondary">
                  Get notified when we find photos with your face
                </p>
              </div>
              <Switch
                checked={settings.photoMatches}
                onCheckedChange={(checked) => updateSetting('photoMatches', checked)}
              />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">New Events</p>
                <p className="text-sm text-secondary">
                  Notifications about new events from photographers you follow
                </p>
              </div>
              <Switch
                checked={settings.newEvents}
                onCheckedChange={(checked) => updateSetting('newEvents', checked)}
              />
            </div>
            <div className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-foreground">Event Updates</p>
                <p className="text-sm text-secondary">
                  Updates about events you&apos;ve joined
                </p>
              </div>
              <Switch
                checked={settings.eventUpdates}
                onCheckedChange={(checked) => updateSetting('eventUpdates', checked)}
              />
            </div>
          </div>

          {/* Delivery Methods */}
          <div>
            <h3 className="text-sm font-medium text-secondary mb-3 px-1">
              Delivery Methods
            </h3>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-foreground">Email</p>
                  <p className="text-sm text-secondary">Receive notifications via email</p>
                </div>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-foreground">Push Notifications</p>
                  <p className="text-sm text-secondary">Browser push notifications</p>
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
    </div>
  );
}
