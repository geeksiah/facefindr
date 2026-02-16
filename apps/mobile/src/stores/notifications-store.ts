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
  title: string;
  message: string;
  data?: Record<string, unknown>;
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
        type: n.template_code || n.templateCode || n.channel || 'system',
        title: n.subject || 'Notification',
        message: n.body || '',
        data: n.metadata || {},
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
            title: payload.new.subject || payload.new.title || 'Notification',
            message: payload.new.body || payload.new.message || '',
            data: payload.new.metadata || payload.new.data,
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
