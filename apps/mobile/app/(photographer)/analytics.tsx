/**
 * Analytics Screen
 * 
 * Revenue and performance analytics for photographers.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  ShoppingCart,
  Users,
} from 'lucide-react-native';

import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface AnalyticsData {
  totalRevenue: number;
  revenueChange: number;
  totalViews: number;
  viewsChange: number;
  totalSales: number;
  salesChange: number;
  conversionRate: number;
  conversionChange: number;
}

interface TopEvent {
  id: string;
  name: string;
  revenue: number;
  views: number;
}

export default function AnalyticsScreen() {
  const { profile } = useAuthStore();
  
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalRevenue: 0,
    revenueChange: 0,
    totalViews: 0,
    viewsChange: 0,
    totalSales: 0,
    salesChange: 0,
    conversionRate: 0,
    conversionChange: 0,
  });
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const loadAnalytics = async () => {
    try {
      // In a real app, this would call an analytics API
      // For now, we'll use placeholder data
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('photographer_id', profile?.id)
        .single();

      setAnalytics({
        totalRevenue: wallet?.balance || 0,
        revenueChange: 12.5,
        totalViews: 1234,
        viewsChange: 8.3,
        totalSales: 45,
        salesChange: -2.1,
        conversionRate: 3.6,
        conversionChange: 0.5,
      });

      // Get top events
      const { data: events } = await supabase
        .from('events')
        .select('id, name')
        .eq('photographer_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (events) {
        setTopEvents(
          events.map((e: any) => ({
            id: e.id,
            name: e.name,
            revenue: Math.random() * 500,
            views: Math.floor(Math.random() * 1000),
          }))
        );
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAnalytics();
  };

  const renderStatCard = (
    title: string,
    value: string,
    change: number,
    icon: React.ReactNode,
    color: string
  ) => (
    <Card style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        {icon}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
      <View style={styles.changeRow}>
        {change >= 0 ? (
          <TrendingUp size={12} color={colors.success} />
        ) : (
          <TrendingDown size={12} color={colors.destructive} />
        )}
        <Text
          style={[
            styles.changeText,
            { color: change >= 0 ? colors.success : colors.destructive },
          ]}
        >
          {Math.abs(change)}%
        </Text>
      </View>
    </Card>
  );

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
          <Text style={styles.title}>Analytics</Text>
          <View style={styles.periodSelector}>
            {(['7d', '30d', '90d'] as const).map((p) => (
              <Text
                key={p}
                style={[
                  styles.periodOption,
                  period === p && styles.periodOptionActive,
                ]}
                onPress={() => setPeriod(p)}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </Text>
            ))}
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {renderStatCard(
            'Revenue',
            `$${analytics.totalRevenue.toFixed(2)}`,
            analytics.revenueChange,
            <DollarSign size={20} color={colors.success} />,
            colors.success
          )}
          {renderStatCard(
            'Views',
            analytics.totalViews.toLocaleString(),
            analytics.viewsChange,
            <Eye size={20} color={colors.accent} />,
            colors.accent
          )}
          {renderStatCard(
            'Sales',
            analytics.totalSales.toString(),
            analytics.salesChange,
            <ShoppingCart size={20} color={colors.warning} />,
            colors.warning
          )}
          {renderStatCard(
            'Conversion',
            `${analytics.conversionRate}%`,
            analytics.conversionChange,
            <Users size={20} color={colors.info} />,
            colors.info
          )}
        </View>

        {/* Top Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performing Events</Text>
          {topEvents.map((event, index) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.eventRank}>{index + 1}</Text>
              <View style={styles.eventInfo}>
                <Text style={styles.eventName} numberOfLines={1}>
                  {event.name}
                </Text>
                <Text style={styles.eventStats}>
                  {event.views} views
                </Text>
              </View>
              <Text style={styles.eventRevenue}>
                ${event.revenue.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Revenue Chart Placeholder */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue Over Time</Text>
          <Card style={styles.chartPlaceholder}>
            <TrendingUp size={48} color={colors.muted} />
            <Text style={styles.chartPlaceholderText}>
              Charts coming soon
            </Text>
          </Card>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  periodSelector: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  periodOption: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  periodOptionActive: {
    color: colors.accent,
    fontWeight: '600',
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
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  statTitle: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.xs,
  },
  changeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventRank: {
    width: 24,
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.secondary,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  eventStats: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  eventRevenue: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.success,
  },
  chartPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartPlaceholderText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
});
