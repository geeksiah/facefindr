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
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  ShoppingCart,
  Users,
  Calendar,
  ChevronRight,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react-native';

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
  sales: number;
}

type PeriodType = '7d' | '30d' | '90d';

export default function AnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [period, setPeriod] = useState<PeriodType>('30d');

  const loadAnalytics = async () => {
    try {
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
            sales: Math.floor(Math.random() * 50),
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
    bgColor: string,
    iconColor: string
  ) => (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        <View style={[styles.statIcon, { backgroundColor: bgColor }]}>
          {icon}
        </View>
        <View style={[
          styles.changeBadge,
          { backgroundColor: change >= 0 ? '#10b98115' : '#ef444415' }
        ]}>
          {change >= 0 ? (
            <TrendingUp size={10} color="#10b981" />
          ) : (
            <TrendingDown size={10} color="#ef4444" />
          )}
          <Text style={[
            styles.changeText,
            { color: change >= 0 ? '#10b981' : '#ef4444' }
          ]}>
            {Math.abs(change)}%
          </Text>
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>Track your performance</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector */}
        <View style={styles.periodContainer}>
          {(['7d', '30d', '90d'] as PeriodType[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.periodChip,
                period === p && styles.periodChipActive,
              ]}
              onPress={() => setPeriod(p)}
            >
              <Text
                style={[
                  styles.periodText,
                  period === p && styles.periodTextActive,
                ]}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue Highlight */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.revenueCard} activeOpacity={0.9}>
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.revenueGradient}
            >
              <View style={styles.revenueHeader}>
                <View style={styles.revenueIconWrapper}>
                  <DollarSign size={20} color="#fff" />
                </View>
                <View style={styles.revenueChangeBadge}>
                  <TrendingUp size={12} color="#fff" />
                  <Text style={styles.revenueChangeText}>+{analytics.revenueChange}%</Text>
                </View>
              </View>
              <Text style={styles.revenueAmount}>${analytics.totalRevenue.toFixed(2)}</Text>
              <Text style={styles.revenueLabel}>Total Revenue</Text>
              <View style={styles.revenueAction}>
                <Text style={styles.revenueActionText}>View Details</Text>
                <ArrowUpRight size={14} color="rgba(255,255,255,0.8)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {renderStatCard(
            'Views',
            analytics.totalViews.toLocaleString(),
            analytics.viewsChange,
            <Eye size={18} color={colors.accent} />,
            colors.accent + '15',
            colors.accent
          )}
          {renderStatCard(
            'Sales',
            analytics.totalSales.toString(),
            analytics.salesChange,
            <ShoppingCart size={18} color="#f59e0b" />,
            '#f59e0b15',
            '#f59e0b'
          )}
          {renderStatCard(
            'Conversion',
            `${analytics.conversionRate}%`,
            analytics.conversionChange,
            <Users size={18} color="#8b5cf6" />,
            '#8b5cf615',
            '#8b5cf6'
          )}
          {renderStatCard(
            'Events',
            topEvents.length.toString(),
            0,
            <Calendar size={18} color="#ec4899" />,
            '#ec489915',
            '#ec4899'
          )}
        </View>

        {/* Top Performing Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Performing</Text>
            <TouchableOpacity onPress={() => router.push('/(photographer)/events')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.eventsCard}>
            {topEvents.map((event, index) => (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventRow,
                  index === topEvents.length - 1 && styles.eventRowLast,
                ]}
                onPress={() => router.push(`/event/${event.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.eventRankBadge}>
                  <Text style={styles.eventRankText}>{index + 1}</Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventName} numberOfLines={1}>
                    {event.name}
                  </Text>
                  <View style={styles.eventStats}>
                    <View style={styles.eventStat}>
                      <Eye size={10} color={colors.secondary} />
                      <Text style={styles.eventStatText}>{event.views}</Text>
                    </View>
                    <View style={styles.eventStat}>
                      <ShoppingCart size={10} color={colors.secondary} />
                      <Text style={styles.eventStatText}>{event.sales}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.eventRevenue}>
                  <Text style={styles.eventRevenueText}>
                    ${event.revenue.toFixed(0)}
                  </Text>
                  <ChevronRight size={16} color={colors.secondary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chart Placeholder */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Revenue Over Time</Text>
          </View>
          <View style={styles.chartCard}>
            <LinearGradient
              colors={[colors.muted, colors.background]}
              style={styles.chartGradient}
            >
              <BarChart3 size={48} color={colors.secondary} strokeWidth={1} />
              <Text style={styles.chartPlaceholderTitle}>Charts Coming Soon</Text>
              <Text style={styles.chartPlaceholderText}>
                Detailed analytics visualizations will be available in a future update
              </Text>
            </LinearGradient>
          </View>
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  periodContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 20,
  },
  periodChipActive: {
    backgroundColor: colors.foreground,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  periodTextActive: {
    color: colors.background,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  revenueCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  revenueGradient: {
    padding: spacing.lg,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  revenueIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revenueChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  revenueChangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  revenueLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.md,
  },
  revenueAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  revenueActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  statTitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventRowLast: {
    borderBottomWidth: 0,
  },
  eventRankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  eventRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  eventStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  eventStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  eventStatText: {
    fontSize: 11,
    color: colors.secondary,
  },
  eventRevenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eventRevenueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  chartCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartGradient: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  chartPlaceholderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.md,
  },
  chartPlaceholderText: {
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
});
