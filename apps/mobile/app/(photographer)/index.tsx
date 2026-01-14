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
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  TrendingUp,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  Eye,
  Plus,
  ChevronRight,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
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
}

export default function DashboardScreen() {
  const router = useRouter();
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
      // Load stats
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
        totalViews: 0, // Would need analytics query
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.displayName}>{profile?.displayName}</Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/create-event')}
          >
            <Plus size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.success + '20' }]}>
              <DollarSign size={20} color={colors.success} />
            </View>
            <Text style={styles.statValue}>${stats.totalRevenue.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </Card>

          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.accent + '20' }]}>
              <Eye size={20} color={colors.accent} />
            </View>
            <Text style={styles.statValue}>{stats.totalViews}</Text>
            <Text style={styles.statLabel}>Views</Text>
          </Card>

          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.warning + '20' }]}>
              <ImageIcon size={20} color={colors.warning} />
            </View>
            <Text style={styles.statValue}>{stats.totalPhotos}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </Card>

          <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.info + '20' }]}>
              <Calendar size={20} color={colors.info} />
            </View>
            <Text style={styles.statValue}>{stats.activeEvents}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(photographer)/upload')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.accent }]}>
                <ImageIcon size={24} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>Upload Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/create-event')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.success }]}>
                <Plus size={24} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>New Event</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => router.push('/(photographer)/analytics')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: colors.warning }]}>
                <TrendingUp size={24} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Events</Text>
            <TouchableOpacity onPress={() => router.push('/(photographer)/events')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentEvents.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No events yet</Text>
              <Button
                onPress={() => router.push('/create-event')}
                size="sm"
                style={{ marginTop: spacing.sm }}
              >
                Create your first event
              </Button>
            </Card>
          ) : (
            recentEvents.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventRow}
                onPress={() => router.push(`/event/${event.id}`)}
              >
                <View style={styles.eventInfo}>
                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.eventDate}>
                    {new Date(event.eventDate).toLocaleDateString()}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.secondary} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
  displayName: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
  },
  seeAll: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  quickActionLabel: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  eventDate: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
});
