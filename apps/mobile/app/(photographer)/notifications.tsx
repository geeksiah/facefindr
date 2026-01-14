/**
 * Photographer Notifications Screen
 * 
 * Shows notifications for new followers, sales, photo views, etc.
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  Image as ImageIcon,
  DollarSign,
  UserPlus,
  Eye,
  CheckCircle2,
  Settings,
  Camera,
  Calendar,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface Notification {
  id: string;
  type: 'sale' | 'follower' | 'view_milestone' | 'event' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

const NOTIFICATION_ICONS: Record<string, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  sale: { icon: DollarSign, color: '#10b981', bg: '#10b98115' },
  follower: { icon: UserPlus, color: colors.accent, bg: colors.accent + '15' },
  view_milestone: { icon: Eye, color: '#8b5cf6', bg: '#8b5cf615' },
  event: { icon: Calendar, color: '#f59e0b', bg: '#f59e0b15' },
  system: { icon: Bell, color: colors.secondary, bg: colors.muted },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setNotifications(
          data.map((item: any) => ({
            id: item.id,
            type: item.type,
            title: item.title,
            message: item.message,
            isRead: item.is_read,
            createdAt: item.created_at,
            data: item.data,
          }))
        );
      }
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
      .channel(`photographer-notifications:${profile.id}`)
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
            type: payload.new.type || 'system',
            title: payload.new.title || '',
            message: payload.new.message || '',
            isRead: payload.new.is_read || false,
            createdAt: payload.new.created_at,
            data: payload.new.data,
          };
          setNotifications((prev) => [newNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadNotifications();
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile?.id)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleNotificationPress = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.type === 'sale' && notification.data?.orderId) {
      router.push(`/order/${notification.data.orderId}`);
    } else if (notification.type === 'event' && notification.data?.eventId) {
      router.push(`/event/${notification.data.eventId}`);
    } else if (notification.type === 'follower' && notification.data?.userId) {
      router.push(`/u/${notification.data.userId}`);
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
      </TouchableOpacity>
    );
  }, []);

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
        You have no new notifications. When you get new followers, sales, or event updates, they'll appear here.
      </Text>
      
      {/* Notification Types Legend */}
      <View style={styles.legendCard}>
        <View style={styles.legendHeader}>
          <Camera size={14} color={colors.accent} />
          <Text style={styles.legendTitle}>What to expect</Text>
        </View>
        <View style={styles.legendItems}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: '#10b98115' }]}>
              <DollarSign size={14} color="#10b981" />
            </View>
            <Text style={styles.legendText}>Photo sales & earnings</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: colors.accent + '15' }]}>
              <UserPlus size={14} color={colors.accent} />
            </View>
            <Text style={styles.legendText}>New followers</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: '#8b5cf615' }]}>
              <Eye size={14} color="#8b5cf6" />
            </View>
            <Text style={styles.legendText}>View milestones</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIcon, { backgroundColor: '#f59e0b15' }]}>
              <Calendar size={14} color="#f59e0b" />
            </View>
            <Text style={styles.legendText}>Event updates</Text>
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
