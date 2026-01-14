/**
 * Notifications Store
 * 
 * Manages notification state and unread counts.
 */

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface Notification {
  id: string;
  type: 'photo_match' | 'new_follower' | 'event_update' | 'payout' | 'system';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  
  // Actions
  fetchNotifications: (userId: string) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  clearNotifications: () => void;
  addNotification: (notification: Notification) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async (userId: string) => {
    set({ isLoading: true });

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const notifications: Notification[] = (data || []).map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
        createdAt: n.created_at,
      }));

      const unreadCount = notifications.filter(n => !n.read).length;

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
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      // Revert on error
      set({ notifications, unreadCount: notifications.filter(n => !n.read).length });
    }
  },

  markAllAsRead: async (userId: string) => {
    const { notifications } = get();
    
    // Optimistic update
    const updated = notifications.map(n => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });

    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
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
}));
