'use client';

/**
 * Notification Bell Component
 * 
 * Shows notification count and dropdown with recent notifications.
 * Uses real-time updates for new notifications.
 */

import { Bell, Check, CheckCheck, X, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';

import { useSSEWithPolling } from '@/hooks';


interface Notification {
  id: string;
  templateCode: string;
  category?: string;
  title?: string | null;
  subject: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
  actionUrl?: string | null;
  details?: Record<string, unknown>;
  dedupeKey?: string | null;
  actor?: { id: string } | null;
  metadata?: Record<string, unknown>;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const latestVersionRef = useRef<number>(0);
  const fetchInFlightRef = useRef(false);
  const fetchQueuedRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const retryStateRef = useRef({
    failureCount: 0,
    nextRetryAt: 0,
    lastLoggedAt: 0,
  });

  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (isOffline()) {
      if (mountedRef.current) {
        setIsLoading(false);
      }
      return;
    }

    const now = Date.now();
    if (now < retryStateRef.current.nextRetryAt) {
      return;
    }

    if (fetchInFlightRef.current) {
      fetchQueuedRef.current = true;
      fetchAbortRef.current?.abort();
      return;
    }

    fetchInFlightRef.current = true;
    try {
      let shouldContinue = true;
      while (shouldContinue) {
        shouldContinue = false;
        fetchQueuedRef.current = false;

        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;

        try {
          const response = await fetch('/api/notifications?limit=10', {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (response.ok && !controller.signal.aborted && mountedRef.current) {
            const data = await response.json();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
            retryStateRef.current.failureCount = 0;
            retryStateRef.current.nextRetryAt = 0;
          }
        } catch (error: any) {
          if (error?.name !== 'AbortError') {
            const failedAt = Date.now();
            const nextCount = Math.min(retryStateRef.current.failureCount + 1, 6);
            const backoffMs = Math.min(30000, 1000 * Math.pow(2, nextCount - 1));
            retryStateRef.current.failureCount = nextCount;
            retryStateRef.current.nextRetryAt = failedAt + backoffMs;
            if (failedAt - retryStateRef.current.lastLoggedAt > 30000) {
              retryStateRef.current.lastLoggedAt = failedAt;
              console.error('Failed to fetch notifications:', error);
            }
          }
        } finally {
          if (fetchAbortRef.current === controller) {
            fetchAbortRef.current = null;
          }
        }

        if (fetchQueuedRef.current) {
          shouldContinue = true;
        }
      }
    } finally {
      fetchInFlightRef.current = false;
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      retryStateRef.current.failureCount = 0;
      retryStateRef.current.nextRetryAt = 0;
      void fetchNotifications();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchNotifications]);

  useSSEWithPolling<{
    unreadCount: number;
    notifications: Array<{
      id: string;
      template_code?: string;
      templateCode?: string;
      category?: string;
      title?: string | null;
      subject: string | null;
      body: string;
      created_at?: string;
      createdAt?: string;
      read_at?: string | null;
      readAt?: string | null;
      action_url?: string | null;
      actionUrl?: string | null;
      details?: Record<string, unknown>;
      dedupeKey?: string | null;
      actor?: { id: string } | null;
      metadata?: Record<string, unknown>;
    }>;
    version?: string;
  }>({
    url: '/api/stream/notifications',
    eventName: 'notifications',
    onPoll: fetchNotifications,
    pollIntervalMs: 15000,
    heartbeatTimeoutMs: 30000,
    onMessage: (payload) => {
      const incomingVersion = Number(payload.version || 0);
      if (incomingVersion && incomingVersion < latestVersionRef.current) {
        return;
      }
      latestVersionRef.current = Math.max(latestVersionRef.current, incomingVersion || 0);

      const mapped: Notification[] = (payload.notifications || []).map((item) => ({
        id: item.id,
        templateCode: item.templateCode || item.template_code || 'generic',
        category: item.category,
        title: item.title || item.subject,
        subject: item.subject,
        body: item.body,
        createdAt: item.createdAt || item.created_at || new Date().toISOString(),
        readAt: item.readAt ?? item.read_at ?? null,
        actionUrl: item.actionUrl || item.action_url || null,
        details: item.details || {},
        dedupeKey: item.dedupeKey || null,
        actor: item.actor || null,
        metadata: item.metadata,
      }));

      setNotifications(mapped.slice(0, 10));
      setUnreadCount(payload.unreadCount || 0);
      setIsLoading(false);
    },
    onError: () => {
      // Polling fallback handles recovery; avoid noisy console churn here.
    },
  });

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Mark single as read
  const markAsRead = async (notificationId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // Optimistic update
    setNotifications(prev =>
      prev.map(n =>
        n.id === notificationId
          ? { ...n, readAt: new Date().toISOString() }
          : n
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
    } catch (error) {
      console.error('Failed to mark as read:', error);
      // Revert on error
      fetchNotifications();
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    setIsMarkingAll(true);
    
    // Optimistic update
    const prevNotifications = [...notifications];
    const prevCount = unreadCount;
    
    setNotifications(prev =>
      prev.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      // Revert on error
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const deleteNotification = async (notificationId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const previous = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    setUnreadCount((prev) => {
      const removed = previous.find((n) => n.id === notificationId);
      if (removed && !removed.readAt) return Math.max(0, prev - 1);
      return prev;
    });

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) throw new Error('Delete failed');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      setNotifications(previous);
      setUnreadCount(previous.filter((n) => !n.readAt).length);
    }
  };

  const clearAllNotifications = async () => {
    if (!notifications.length) return;
    setIsClearingAll(true);
    const previous = notifications;
    setNotifications([]);
    setUnreadCount(0);
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!response.ok) throw new Error('Clear all failed');
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      setNotifications(previous);
      setUnreadCount(previous.filter((n) => !n.readAt).length);
    } finally {
      setIsClearingAll(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  // Get notification link based on type
  const getNotificationLink = (notification: Notification): string | null => {
    if (notification.actionUrl && notification.actionUrl.startsWith('/')) {
      return notification.actionUrl;
    }
    const meta = notification.metadata as Record<string, string> | undefined;
    return meta?.event_id ? `/gallery/events/${meta.event_id}` : null;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-secondary hover:text-foreground hover:bg-muted transition-all duration-200 active:scale-95"
        aria-label="Notifications"
      >
        <Bell className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'scale-110' : ''}`} />
        
        {/* Badge with animation */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white px-1 animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 rounded-2xl bg-card border border-border shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={clearAllNotifications}
                  disabled={isClearingAll}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
                >
                  {isClearingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Clear all
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={isMarkingAll}
                  className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50 transition-opacity"
                >
                  {isMarkingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3 w-3" />
                  )}
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-secondary hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-secondary font-medium">No notifications yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll notify you when something happens
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification, index) => {
                  const link = getNotificationLink(notification);
                  const isUnread = !notification.readAt;
                  
                  const content = (
                    <div
                      className={`
                        relative px-4 py-3 transition-all duration-200
                        ${isUnread ? 'bg-accent/5' : 'hover:bg-muted/50'}
                        ${link ? 'cursor-pointer' : ''}
                      `}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Unread indicator */}
                      {isUnread && (
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      )}
                      
                      <div className="flex items-start gap-3 pl-2">
                        <div className="flex-1 min-w-0">
                          {(notification.title || notification.subject) && (
                            <p className={`text-sm truncate ${isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'}`}>
                              {notification.title || notification.subject}
                            </p>
                          )}
                          <p className={`text-sm ${isUnread ? 'text-secondary' : 'text-muted-foreground'} line-clamp-2`}>
                            {notification.body}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {link && (
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {isUnread && (
                            <button
                              onClick={(e) => markAsRead(notification.id, e)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-all duration-200"
                              title="Mark as read"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => deleteNotification(notification.id, e)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
                            title="Delete notification"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                        setIsOpen(false);
                      }}
                      className="block animate-in fade-in slide-in-from-top-1"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div 
                      key={notification.id}
                      className="animate-in fade-in slide-in-from-top-1"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-muted/30">
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center gap-2 text-sm text-accent font-medium hover:underline transition-colors"
              >
                View all notifications
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
