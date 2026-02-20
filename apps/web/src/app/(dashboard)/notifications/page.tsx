'use client';

/**
 * Notifications Page
 * 
 * Full list of all notifications with filters.
 */

import { 
  Bell, 
  Check, 
  CheckCheck, 
  Filter, 
  Loader2,
  Camera,
  DollarSign,
  Package,
  Megaphone,
  ExternalLink,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

import { DashboardBanner } from '@/components/notifications';
import { Button } from '@/components/ui';

interface Notification {
  id: string;
  templateCode: string;
  subject: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
  metadata?: Record<string, unknown>;
}

type FilterType = 'all' | 'unread' | 'photos' | 'payments' | 'orders' | 'system';

const FILTERS: { value: FilterType; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Bell className="h-4 w-4" /> },
  { value: 'unread', label: 'Unread', icon: <Check className="h-4 w-4" /> },
  { value: 'photos', label: 'Photos', icon: <Camera className="h-4 w-4" /> },
  { value: 'payments', label: 'Payments', icon: <DollarSign className="h-4 w-4" /> },
  { value: 'orders', label: 'Orders', icon: <Package className="h-4 w-4" /> },
  { value: 'system', label: 'System', icon: <Megaphone className="h-4 w-4" /> },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications?limit=100');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    switch (filter) {
      case 'unread':
        return !n.readAt;
      case 'photos':
        return ['photo_drop', 'event_live'].includes(n.templateCode);
      case 'payments':
        return ['payout_success', 'purchase_complete'].includes(n.templateCode);
      case 'orders':
        return ['order_shipped', 'order_delivered'].includes(n.templateCode);
      case 'system':
        return ['verification_otp', 'account_update'].includes(n.templateCode);
      default:
        return true;
    }
  });

  const unreadCount = notifications.filter(n => !n.readAt).length;

  // Mark single as read
  const markAsRead = async (notificationId: string) => {
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
      fetchNotifications();
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    setIsMarkingAll(true);
    
    setNotifications(prev =>
      prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      fetchNotifications();
    } finally {
      setIsMarkingAll(false);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    const previous = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete');
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
        throw new Error('Failed to clear all');
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      setNotifications(previous);
    } finally {
      setIsClearingAll(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getNotificationIcon = (templateCode: string) => {
    switch (templateCode) {
      case 'photo_drop':
      case 'event_live':
        return <Camera className="h-5 w-5 text-blue-500" />;
      case 'payout_success':
      case 'purchase_complete':
        return <DollarSign className="h-5 w-5 text-green-500" />;
      case 'order_shipped':
      case 'order_delivered':
        return <Package className="h-5 w-5 text-orange-500" />;
      default:
        return <Bell className="h-5 w-5 text-purple-500" />;
    }
  };

  const getNotificationLink = (notification: Notification): string | null => {
    const meta = notification.metadata as Record<string, string> | undefined;
    switch (notification.templateCode) {
      case 'photo_drop':
        return meta?.event_id ? `/gallery/events/${meta.event_id}` : '/gallery';
      case 'payout_success':
        return '/dashboard/billing';
      case 'order_shipped':
        return meta?.order_id ? `/gallery/orders/${meta.order_id}` : '/gallery/orders';
      case 'event_live':
        return meta?.event_id ? `/events/${meta.event_id}` : '/gallery/events';
      case 'purchase_complete':
        return '/gallery/purchases';
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Ad Placement */}
      <DashboardBanner />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-secondary">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              onClick={clearAllNotifications}
              disabled={isClearingAll}
            >
              {isClearingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear all
            </Button>
          )}
          {unreadCount > 0 && (
            <Button
              variant="secondary"
              onClick={markAllAsRead}
              disabled={isMarkingAll}
            >
              {isMarkingAll ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCheck className="h-4 w-4 mr-2" />
              )}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filters - Desktop */}
      <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200
              ${filter === f.value 
                ? 'bg-foreground text-background' 
                : 'bg-muted text-foreground hover:bg-muted/80'
              }
            `}
          >
            {f.icon}
            {f.label}
            {f.value === 'unread' && unreadCount > 0 && (
              <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white px-1">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters - Mobile */}
      <div className="sm:hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span className="font-medium">{FILTERS.find(f => f.value === filter)?.label}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
        </button>
        
        {showFilters && (
          <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2 duration-200">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setFilter(f.value);
                  setShowFilters(false);
                }}
                className={`
                  flex items-center gap-3 w-full px-4 py-3 text-left transition-colors
                  ${filter === f.value ? 'bg-accent/10 text-accent' : 'hover:bg-muted'}
                `}
              >
                {f.icon}
                <span className="font-medium">{f.label}</span>
                {f.value === 'unread' && unreadCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white px-1">
                    {unreadCount}
                  </span>
                )}
                {filter === f.value && <Check className="h-4 w-4 ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium text-foreground">No notifications</p>
            <p className="text-sm text-secondary mt-1">
              {filter === 'all' 
                ? "You're all caught up! Check back later." 
                : `No ${filter} notifications yet.`
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map((notification, index) => {
              const link = getNotificationLink(notification);
              const isUnread = !notification.readAt;

              const content = (
                <div 
                  className={`
                    relative px-6 py-4 transition-all duration-200
                    ${isUnread ? 'bg-accent/5' : 'hover:bg-muted/50'}
                    ${link ? 'cursor-pointer' : ''}
                  `}
                >
                  {/* Unread indicator */}
                  {isUnread && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent animate-pulse" />
                  )}

                  <div className="flex items-start gap-4 pl-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                        {getNotificationIcon(notification.templateCode)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {notification.subject && (
                        <p className={`font-medium ${isUnread ? 'text-foreground' : 'text-foreground/80'}`}>
                          {notification.subject}
                        </p>
                      )}
                      <p className={`text-sm ${isUnread ? 'text-secondary' : 'text-muted-foreground'} mt-1`}>
                        {notification.body}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {link && (
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      )}
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="p-2 rounded-xl text-secondary hover:text-accent hover:bg-accent/10 transition-all duration-200"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="p-2 rounded-xl text-secondary hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                        title="Delete notification"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );

              return link ? (
                <Link
                  key={notification.id}
                  href={link}
                  onClick={() => {
                    if (isUnread) markAsRead(notification.id);
                  }}
                  className="block animate-in fade-in slide-in-from-left-1"
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={notification.id}
                  className="animate-in fade-in slide-in-from-left-1"
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
