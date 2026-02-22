/**
 * Notifications Store
 * 
 * Manages notification state and unread counts with realtime support.
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { getApiBaseUrl } from '@/lib/api-base';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = getApiBaseUrl();

export interface Notification {
  id: string;
  type: string;
  templateCode: string;
  category: 'transactions' | 'photos' | 'orders' | 'social' | 'system' | 'marketing';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  details: Record<string, unknown>;
  actionUrl: string | null;
  dedupeKey: string | null;
  actor?: { id?: string | null } | null;
  read: boolean;
  createdAt: string;
  channel?: string;
  status?: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  realtimeChannel: RealtimeChannel | null;
  
  // Actions
  fetchNotifications: (userId: string) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAllRemote: () => Promise<void>;
  clearNotifications: () => void;
  addNotification: (notification: Notification) => void;
  subscribeToRealtime: (userId: string) => void;
  unsubscribeFromRealtime: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  realtimeChannel: null,

  fetchNotifications: async (userId: string) => {
    set({ isLoading: true });
    void userId;

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      if (!accessToken || !API_URL) {
        set({ notifications: [], unreadCount: 0, isLoading: false });
        return;
      }

      const response = await fetch(`${API_URL}/api/notifications?limit=50`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load notifications');
      }

      const notifications: Notification[] = (payload.notifications || []).map((n: any) => ({
        id: n.id,
        type: n.templateCode || n.template_code || n.category || n.channel || 'system',
        templateCode: n.templateCode || n.template_code || 'system',
        category: (n.category || 'system') as Notification['category'],
        title: n.title || n.subject || 'Notification',
        message: n.body || '',
        data: n.metadata || {},
        details: n.details || {},
        actionUrl: n.actionUrl || n.action_url || null,
        dedupeKey: n.dedupeKey || n.dedupe_key || null,
        actor: n.actor || (n.actor_user_id ? { id: n.actor_user_id } : null),
        read: Boolean(n.read_at || n.readAt),
        createdAt: n.created_at || n.createdAt || new Date().toISOString(),
        channel: n.channel,
        status: n.status,
      }));

      const unreadCount = typeof payload.unreadCount === 'number'
        ? payload.unreadCount
        : notifications.filter(n => !n.read).length;

      set({ notifications, unreadCount, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ isLoading: false });
    }
  },

  markAsRead: async (notificationId: string) => {
    const { notifications } = get();
    
    // Optimistic update
    const updated = notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    const unreadCount = updated.filter(n => !n.read).length;
    set({ notifications: updated, unreadCount });

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      if (!accessToken || !API_URL) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to mark notification as read');
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      // Revert on error
      set({ notifications, unreadCount: notifications.filter(n => !n.read).length });
    }
  },

  markAllAsRead: async (userId: string) => {
    const { notifications } = get();
    void userId;
    
    // Optimistic update
    const updated = notifications.map(n => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      if (!accessToken || !API_URL) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to mark all notifications as read');
      }
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      // Revert on error
      set({ notifications, unreadCount: notifications.filter(n => !n.read).length });
    }
  },

  deleteNotification: async (notificationId: string) => {
    const { notifications } = get();
    const existing = notifications.find((n) => n.id === notificationId);
    const updated = notifications.filter((n) => n.id !== notificationId);
    const unreadCount = updated.filter((n) => !n.read).length;
    set({ notifications: updated, unreadCount });

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      if (!accessToken || !API_URL) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to delete notification');
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
      if (existing) {
        const restored = [existing, ...updated].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        set({ notifications: restored, unreadCount: restored.filter((n) => !n.read).length });
      }
    }
  },

  clearAllRemote: async () => {
    const { notifications } = get();
    set({ notifications: [], unreadCount: 0 });

    try {
      const accessToken = useAuthStore.getState().session?.access_token;
      if (!accessToken || !API_URL) {
        throw new Error('Missing auth session');
      }

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Failed to clear notifications');
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      });
    }
  },

  clearNotifications: () => {
    set({ notifications: [], unreadCount: 0 });
  },

  addNotification: (notification: Notification) => {
    const { notifications } = get();
    const updated = [notification, ...notifications];
    const unreadCount = updated.filter(n => !n.read).length;
    set({ notifications: updated, unreadCount });
  },

  subscribeToRealtime: (userId: string) => {
    const { realtimeChannel, addNotification } = get();
    
    // Don't subscribe twice
    if (realtimeChannel) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification: Notification = {
            id: payload.new.id,
            type: payload.new.template_code || payload.new.type || payload.new.channel || 'system',
            templateCode: payload.new.template_code || 'system',
            category: (payload.new.category || 'system') as Notification['category'],
            title: payload.new.subject || payload.new.title || 'Notification',
            message: payload.new.body || payload.new.message || '',
            data: payload.new.metadata || payload.new.data,
            details: payload.new.details || {},
            actionUrl: payload.new.action_url || null,
            dedupeKey: payload.new.dedupe_key || null,
            actor: payload.new.actor_user_id ? { id: payload.new.actor_user_id } : null,
            read: Boolean(payload.new.read_at),
            createdAt: payload.new.created_at,
            channel: payload.new.channel,
            status: payload.new.status,
          };
          addNotification(newNotification);
        }
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribeFromRealtime: () => {
    const { realtimeChannel } = get();
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      set({ realtimeChannel: null });
    }
  },
}));
