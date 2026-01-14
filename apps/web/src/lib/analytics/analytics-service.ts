/**
 * Analytics Service
 * 
 * Handles view tracking, dashboard stats, and reporting.
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export type ViewType = 'photo' | 'event' | 'profile' | 'gallery';
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type TimeRange = '7d' | '30d' | '90d' | '365d' | 'all';

export interface DashboardStats {
  totalViews: number;
  uniqueViews: number;
  totalRevenue: number;
  totalSales: number;
  totalDownloads: number;
  totalEvents: number;
  totalPhotos: number;
  avgViewsPerEvent: number;
  avgRevenuePerEvent: number;
  conversionRate: number;
}

export interface TimeSeriesData {
  date: string;
  views: number;
  revenue: number;
  sales: number;
  downloads: number;
}

export interface TopEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  totalViews: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface TrafficSource {
  source: string;
  count: number;
  percentage: number;
}

export interface DeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
}

// ============================================
// TRACK VIEW
// ============================================

export interface TrackViewOptions {
  viewType: ViewType;
  eventId?: string;
  mediaId?: string;
  photographerId?: string;
  viewerId?: string;
  viewerType?: 'photographer' | 'attendee' | 'anonymous';
  ipHash?: string;
  countryCode?: string;
  deviceType?: DeviceType;
  sessionId?: string;
  userAgent?: string;
  referrer?: string;
}

export async function trackView(options: TrackViewOptions): Promise<string | null> {
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase.rpc('record_view', {
      p_view_type: options.viewType,
      p_event_id: options.eventId || null,
      p_media_id: options.mediaId || null,
      p_photographer_id: options.photographerId || null,
      p_viewer_id: options.viewerId || null,
      p_viewer_type: options.viewerType || 'anonymous',
      p_ip_hash: options.ipHash || null,
      p_country_code: options.countryCode || null,
      p_device_type: options.deviceType || 'desktop',
      p_session_id: options.sessionId || null,
    });

    if (error) {
      console.error('Failed to track view:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Track view error:', error);
    return null;
  }
}

// ============================================
// GET DASHBOARD STATS
// ============================================

export async function getDashboardStats(
  photographerId: string,
  timeRange: TimeRange = '30d'
): Promise<DashboardStats> {
  const supabase = createServiceClient();
  
  const { startDate, endDate } = getDateRange(timeRange);

  const { data, error } = await supabase.rpc('get_photographer_stats', {
    p_photographer_id: photographerId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error || !data || data.length === 0) {
    return {
      totalViews: 0,
      uniqueViews: 0,
      totalRevenue: 0,
      totalSales: 0,
      totalDownloads: 0,
      totalEvents: 0,
      totalPhotos: 0,
      avgViewsPerEvent: 0,
      avgRevenuePerEvent: 0,
      conversionRate: 0,
    };
  }

  const stats = data[0];
  return {
    totalViews: Number(stats.total_views) || 0,
    uniqueViews: Number(stats.unique_views) || 0,
    totalRevenue: Number(stats.total_revenue) || 0,
    totalSales: Number(stats.total_sales) || 0,
    totalDownloads: Number(stats.total_downloads) || 0,
    totalEvents: Number(stats.total_events) || 0,
    totalPhotos: Number(stats.total_photos) || 0,
    avgViewsPerEvent: Number(stats.avg_views_per_event) || 0,
    avgRevenuePerEvent: Number(stats.avg_revenue_per_event) || 0,
    conversionRate: Number(stats.conversion_rate) || 0,
  };
}

// ============================================
// GET TIME SERIES DATA
// ============================================

export async function getTimeSeriesData(
  photographerId: string,
  timeRange: TimeRange = '30d',
  eventId?: string
): Promise<TimeSeriesData[]> {
  const supabase = createServiceClient();
  
  const { startDate, endDate } = getDateRange(timeRange);

  const { data, error } = await supabase.rpc('get_analytics_timeseries', {
    p_photographer_id: photographerId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_event_id: eventId || null,
  });

  if (error || !data) {
    return [];
  }

  return data.map((row: { date: string; views: number; revenue: number; sales: number; downloads: number }) => ({
    date: row.date,
    views: row.views || 0,
    revenue: row.revenue || 0,
    sales: row.sales || 0,
    downloads: row.downloads || 0,
  }));
}

// ============================================
// GET TOP EVENTS
// ============================================

export async function getTopEvents(
  photographerId: string,
  limit: number = 5,
  metric: 'views' | 'revenue' | 'conversion' = 'views'
): Promise<TopEvent[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('get_top_events', {
    p_photographer_id: photographerId,
    p_limit: limit,
    p_metric: metric,
  });

  if (error || !data) {
    return [];
  }

  return data.map((row: { event_id: string; event_name: string; event_date: string; total_views: number; total_revenue: number; conversion_rate: number }) => ({
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date,
    totalViews: row.total_views || 0,
    totalRevenue: row.total_revenue || 0,
    conversionRate: Number(row.conversion_rate) || 0,
  }));
}

// ============================================
// GET DEVICE BREAKDOWN
// ============================================

export async function getDeviceBreakdown(
  photographerId: string,
  timeRange: TimeRange = '30d'
): Promise<DeviceBreakdown> {
  const supabase = createServiceClient();
  
  const { startDate, endDate } = getDateRange(timeRange);

  const { data } = await supabase
    .from('analytics_daily')
    .select('mobile_views, desktop_views, tablet_views')
    .eq('photographer_id', photographerId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!data || data.length === 0) {
    return { mobile: 0, desktop: 0, tablet: 0 };
  }

  const totals = data.reduce(
    (acc, row) => ({
      mobile: acc.mobile + (row.mobile_views || 0),
      desktop: acc.desktop + (row.desktop_views || 0),
      tablet: acc.tablet + (row.tablet_views || 0),
    }),
    { mobile: 0, desktop: 0, tablet: 0 }
  );

  return totals;
}

// ============================================
// GET TRAFFIC SOURCES
// ============================================

export async function getTrafficSources(
  photographerId: string,
  timeRange: TimeRange = '30d'
): Promise<TrafficSource[]> {
  const supabase = createServiceClient();
  
  const { startDate, endDate } = getDateRange(timeRange);

  const { data } = await supabase
    .from('analytics_daily')
    .select('direct_traffic, social_traffic, search_traffic, referral_traffic')
    .eq('photographer_id', photographerId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (!data || data.length === 0) {
    return [];
  }

  const totals = data.reduce(
    (acc, row) => ({
      direct: acc.direct + (row.direct_traffic || 0),
      social: acc.social + (row.social_traffic || 0),
      search: acc.search + (row.search_traffic || 0),
      referral: acc.referral + (row.referral_traffic || 0),
    }),
    { direct: 0, social: 0, search: 0, referral: 0 }
  );

  const total = totals.direct + totals.social + totals.search + totals.referral;

  if (total === 0) {
    return [];
  }

  return [
    { source: 'Direct', count: totals.direct, percentage: (totals.direct / total) * 100 },
    { source: 'Social', count: totals.social, percentage: (totals.social / total) * 100 },
    { source: 'Search', count: totals.search, percentage: (totals.search / total) * 100 },
    { source: 'Referral', count: totals.referral, percentage: (totals.referral / total) * 100 },
  ].filter(s => s.count > 0);
}

// ============================================
// GET RECENT ACTIVITY
// ============================================

export interface RecentActivity {
  id: string;
  type: 'view' | 'sale' | 'download' | 'scan';
  description: string;
  timestamp: Date;
  eventName?: string;
  amount?: number;
}

export async function getRecentActivity(
  photographerId: string,
  limit: number = 10
): Promise<RecentActivity[]> {
  const supabase = createServiceClient();

  // Get recent views
  const { data: views } = await supabase
    .from('analytics_views')
    .select(`
      id,
      view_type,
      viewed_at,
      event:event_id (name)
    `)
    .eq('photographer_id', photographerId)
    .order('viewed_at', { ascending: false })
    .limit(limit);

  // Get recent sales
  const { data: sales } = await supabase
    .from('photo_purchases')
    .select(`
      id,
      total_amount,
      created_at,
      event:event_id (name)
    `)
    .eq('photographer_id', photographerId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);

  const activities: RecentActivity[] = [];

  if (views) {
    for (const view of views) {
      activities.push({
        id: view.id,
        type: 'view',
        description: `Someone viewed ${view.view_type === 'photo' ? 'a photo' : 'your event'}`,
        timestamp: new Date(view.viewed_at),
        eventName: (view.event as { name: string } | null)?.name,
      });
    }
  }

  if (sales) {
    for (const sale of sales) {
      activities.push({
        id: sale.id,
        type: 'sale',
        description: 'New photo purchase',
        timestamp: new Date(sale.created_at),
        eventName: (sale.event as { name: string } | null)?.name,
        amount: sale.total_amount,
      });
    }
  }

  // Sort by timestamp and limit
  return activities
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

// ============================================
// GET REALTIME STATS
// ============================================

export interface RealtimeStats {
  activeViewers: number;
  viewsThisHour: number;
  salesThisHour: number;
  revenueThisHour: number;
  viewsToday: number;
  salesToday: number;
  revenueToday: number;
}

export async function getRealtimeStats(photographerId: string): Promise<RealtimeStats> {
  const supabase = createServiceClient();
  
  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  const { data } = await supabase
    .from('analytics_realtime')
    .select('*')
    .eq('photographer_id', photographerId)
    .gte('period_start', hourStart.toISOString())
    .order('period_start', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return {
      activeViewers: 0,
      viewsThisHour: 0,
      salesThisHour: 0,
      revenueThisHour: 0,
      viewsToday: 0,
      salesToday: 0,
      revenueToday: 0,
    };
  }

  return {
    activeViewers: data.active_viewers || 0,
    viewsThisHour: data.views_this_hour || 0,
    salesThisHour: data.sales_this_hour || 0,
    revenueThisHour: data.revenue_this_hour || 0,
    viewsToday: data.views_today || 0,
    salesToday: data.sales_today || 0,
    revenueToday: data.revenue_today || 0,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDateRange(timeRange: TimeRange): { startDate: string; endDate: string } {
  const endDate = new Date();
  let startDate: Date;

  switch (timeRange) {
    case '7d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '365d':
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 365);
      break;
    case 'all':
      startDate = new Date('2020-01-01');
      break;
    default:
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

export function formatCurrency(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function calculateChange(current: number, previous: number): { value: number; isPositive: boolean } {
  if (previous === 0) {
    return { value: current > 0 ? 100 : 0, isPositive: current > 0 };
  }
  const change = ((current - previous) / previous) * 100;
  return { value: Math.abs(change), isPositive: change >= 0 };
}
