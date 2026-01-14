/**
 * Photographer Dashboard Screen
 * 
 * Overview of events, revenue, and quick actions.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TrendingUp,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  Eye,
  Plus,
  ChevronRight,
  Upload,
  BarChart3,
  Camera,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface DashboardStats {
  totalRevenue: number;
  totalViews: number;
  totalPhotos: number;
  activeEvents: number;
}

interface RecentEvent {
  id: string;
  name: string;
  photoCount: number;
  viewCount: number;
  eventDate: string;
  status: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalViews: 0,
    totalPhotos: 0,
    activeEvents: 0,
  });
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboardData = async () => {
    try {
      const [eventsRes, photosRes, walletRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, name, event_date, status')
          .eq('photographer_id', profile?.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('media')
          .select('id', { count: 'exact' })
          .eq('photographer_id', profile?.id),
        supabase
          .from('wallets')
          .select('balance')
          .eq('photographer_id', profile?.id)
          .single(),
      ]);

      const activeEvents = eventsRes.data?.filter((e: any) => e.status === 'active').length || 0;
      
      setStats({
        totalRevenue: walletRes.data?.balance || 0,
        totalViews: 0,
        totalPhotos: photosRes.count || 0,
        activeEvents,
      });

      setRecentEvents(
        (eventsRes.data || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          photoCount: 0,
          viewCount: 0,
          eventDate: e.event_date,
          status: e.status,
        }))
      );
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  const statCards = [
    {
      label: 'Revenue',
      value: `$${stats.totalRevenue.toFixed(0)}`,
      icon: DollarSign,
      color: '#10b981',
      bgColor: '#10b98115',
    },
    {
      label: 'Photos',
      value: stats.totalPhotos.toString(),
      icon: ImageIcon,
      color: colors.accent,
      bgColor: colors.accent + '15',
    },
    {
      label: 'Views',
      value: stats.totalViews.toString(),
      icon: Eye,
      color: '#8b5cf6',
      bgColor: '#8b5cf615',
    },
    {
      label: 'Events',
      value: stats.activeEvents.toString(),
      icon: Calendar,
      color: '#f59e0b',
      bgColor: '#f59e0b15',
    },
  ];

  const quickActions = [
    {
      label: 'Upload',
      icon: Upload,
      color: colors.accent,
      onPress: () => router.push('/(photographer)/upload'),
    },
    {
      label: 'New Event',
      icon: Plus,
      color: '#10b981',
      onPress: () => router.push('/create-event'),
    },
    {
      label: 'Analytics',
      icon: BarChart3,
      color: '#8b5cf6',
      onPress: () => router.push('/(photographer)/analytics'),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent, 
          { paddingTop: insets.top + 16 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.displayName}>{profile?.displayName}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => router.push('/(photographer)/profile')}
          >
            {profile?.profilePhotoUrl ? (
              <Image source={{ uri: profile.profilePhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Camera size={20} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            {statCards.slice(0, 2).map((stat, index) => (
              <View key={index} style={styles.statCard}>
                <View style={[styles.statIconContainer, { backgroundColor: stat.bgColor }]}>
                  <stat.icon size={18} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.statsRow}>
            {statCards.slice(2, 4).map((stat, index) => (
              <View key={index} style={styles.statCard}>
                <View style={[styles.statIconContainer, { backgroundColor: stat.bgColor }]}>
                  <stat.icon size={18} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickActionCard}
                onPress={action.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: action.color + '15' }]}>
                  <action.icon size={22} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Events</Text>
            <TouchableOpacity 
              onPress={() => router.push('/(photographer)/events')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Calendar size={32} color={colors.secondary} />
              </View>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyDescription}>
                Create your first event to start uploading photos
              </Text>
              <TouchableOpacity
                style={styles.createEventButton}
                onPress={() => router.push('/create-event')}
                activeOpacity={0.8}
              >
                <Plus size={18} color="#fff" />
                <Text style={styles.createEventButtonText}>Create Event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.eventsCard}>
              {recentEvents.map((event, index) => (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventRow,
                    index < recentEvents.length - 1 && styles.eventRowBorder,
                  ]}
                  onPress={() => router.push(`/event/${event.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventIconContainer}>
                    <Calendar size={18} color={colors.accent} />
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventName} numberOfLines={1}>{event.name}</Text>
                    <Text style={styles.eventDate}>
                      {new Date(event.eventDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    event.status === 'active' && styles.statusActive,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      event.status === 'active' && styles.statusTextActive,
                    ]}>
                      {event.status}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>The FaceFindr Team</Text>
          <Text style={styles.footerCopyright}>© 2025 FaceFindr. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: colors.secondary,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: 2,
  },
  avatarContainer: {
    marginLeft: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
  },
  eventsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  eventRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  eventDate: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.muted,
    marginRight: spacing.sm,
  },
  statusActive: {
    backgroundColor: '#10b98115',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'capitalize',
  },
  statusTextActive: {
    color: '#10b981',
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  createEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.lg,
  },
  createEventButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  footerCopyright: {
    fontSize: 11,
    color: colors.secondary,
    opacity: 0.7,
    marginTop: 4,
  },
});
