/**
 * Notifications Screen
 * 
 * Shows user notifications for photo drops, purchases, etc.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Image as ImageIcon,
  ShoppingBag,
  Tag,
  CheckCircle2,
  Settings,
  Trash2,
  Gift,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useNotificationsStore } from '@/stores/notifications-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';

const API_URL = getApiBaseUrl();

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

const NOTIFICATION_ICONS: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  photo_drop: { icon: ImageIcon, color: colors.accent, bg: colors.accent + '15' },
  purchase: { icon: ShoppingBag, color: '#10b981', bg: '#10b98115' },
  promo: { icon: Tag, color: '#f59e0b', bg: '#f59e0b15' },
  system: { icon: Bell, color: '#8b5cf6', bg: '#8b5cf615' },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuthStore();
  const { fetchNotifications } = useNotificationsStore();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadNotifications = async () => {
    try {
      if (!session?.access_token) return;

      const response = await fetch(`${API_URL}/api/notifications?limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load notifications');
      }

      setNotifications(
        (payload.notifications || []).map((item: any) => ({
          id: item.id,
          type: item.template_code || item.templateCode || item.channel || 'system',
          title: item.subject || 'Notification',
          message: item.body || '',
          isRead: Boolean(item.read_at || item.readAt),
          createdAt: item.created_at || item.createdAt || new Date().toISOString(),
          data: item.metadata || {},
        }))
      );
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch and realtime subscription
  useEffect(() => {
    loadNotifications();

    // Subscribe to realtime updates
    if (!profile?.id) return;
    
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          // Add new notification at the top
          const newNotification: Notification = {
            id: payload.new.id,
            type: payload.new.template_code || payload.new.type || payload.new.channel || 'system',
            title: payload.new.subject || payload.new.title || 'Notification',
            message: payload.new.body || payload.new.message || '',
            isRead: Boolean(payload.new.read_at),
            createdAt: payload.new.created_at,
            data: payload.new.metadata || payload.new.data,
          };
          setNotifications((prev) => [newNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, session?.access_token]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id: string) => {
    if (!session?.access_token) return;

    await fetch(`${API_URL}/api/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ notificationId: id }),
    });

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllAsRead = async () => {
    if (!session?.access_token) return;

    await fetch(`${API_URL}/api/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ markAllRead: true }),
    });

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const deleteNotification = async (notificationId: string) => {
    if (!session?.access_token) return;

    const previous = notifications;
    const updated = notifications.filter((n) => n.id !== notificationId);
    setNotifications(updated);

    try {
      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ notificationId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to delete notification');
      }
      if (profile?.id) {
        void fetchNotifications(profile.id);
      }
    } catch (error: any) {
      setNotifications(previous);
      Alert.alert('Delete failed', error?.message || 'Failed to delete notification');
    }
  };

  const clearAllNotifications = async () => {
    if (!session?.access_token || notifications.length === 0) return;

    const previous = notifications;
    setNotifications([]);
    try {
      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clearAll: true }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to clear notifications');
      }
      if (profile?.id) {
        void fetchNotifications(profile.id);
      }
    } catch (error: any) {
      setNotifications(previous);
      Alert.alert('Clear failed', error?.message || 'Failed to clear notifications');
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.type === 'photo_drop' && notification.data?.eventId) {
      router.push(`/event/${notification.data.eventId}` as any);
    } else if (notification.type === 'purchase' && notification.data?.orderId) {
      router.push(`/order/${notification.data.orderId}` as any);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const renderNotification = useCallback(({ item, index }: { item: Notification; index: number }) => {
    const config = NOTIFICATION_ICONS[item.type] || NOTIFICATION_ICONS.system;
    const Icon = config.icon;

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          !item.isRead && styles.notificationUnread,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
          <Icon size={20} color={config.color} />
        </View>
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text
              style={[
                styles.notificationTitle,
                !item.isRead && styles.notificationTitleUnread,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {!item.isRead && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.notificationMessage} numberOfLines={2}>
            {item.message}
          </Text>
          <Text style={styles.notificationTime}>
            {formatTimeAgo(item.createdAt)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={(event) => {
            event.stopPropagation();
            void deleteNotification(item.id);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Trash2 size={16} color={colors.secondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [deleteNotification, handleNotificationPress]);

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={[colors.accent + '15', colors.accent + '05']}
        style={styles.emptyIcon}
      >
        <Bell size={40} color={colors.accent} strokeWidth={1.5} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>All caught up!</Text>
      <Text style={styles.emptyDescription}>
        You have no new notifications. When photographers drop photos or you receive updates, they'll appear here.
      </Text>
      
      {/* Notification Types Legend */}
      <View style={styles.legendCard}>
        <View style={styles.legendHeader}>
          <Gift size={14} color={colors.accent} />
          <Text style={styles.legendTitle}>What to expect</Text>
        </View>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: colors.accent + '15' }]}>
              <ImageIcon size={14} color={colors.accent} />
            </View>
            <Text style={styles.legendText}>New photos from events</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: '#10b98115' }]}>
              <ShoppingBag size={14} color="#10b981" />
            </View>
            <Text style={styles.legendText}>Purchase confirmations</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: '#f59e0b15' }]}>
              <Tag size={14} color="#f59e0b" />
            </View>
            <Text style={styles.legendText}>Special offers & promos</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert('Clear all', 'Delete all notifications?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void clearAllNotifications() },
                ]);
              }}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Trash2 size={18} color={colors.secondary} />
            </TouchableOpacity>
          )}
          {unreadCount > 0 && (
            <TouchableOpacity 
              onPress={markAllAsRead} 
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <CheckCircle2 size={20} color={colors.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            onPress={() => router.push('/settings/notifications')} 
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Settings size={20} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Unread Summary */}
      {unreadCount > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryCount}>{unreadCount}</Text> unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.emptyListContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={!isLoading ? EmptyState : null}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />
    </View>
  );
}

function formatTimeAgo(dateString: string): string {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarBg: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent + '10',
    borderBottomWidth: 1,
    borderBottomColor: colors.accent + '20',
  },
  summaryText: {
    fontSize: 13,
    color: colors.secondary,
  },
  summaryCount: {
    fontWeight: '600',
    color: colors.accent,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationUnread: {
    backgroundColor: colors.accent + '05',
    borderColor: colors.accent + '20',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
    flex: 1,
  },
  notificationTitleUnread: {
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  notificationMessage: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  notificationTime: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: 15,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  legendCard: {
    width: '100%',
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  legendTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
  },
  legendItems: {
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legendIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendText: {
    fontSize: 13,
    color: colors.secondary,
    flex: 1,
  },
});
