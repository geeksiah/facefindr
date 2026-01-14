'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users, 
  DollarSign, 
  Eye, 
  Download, 
  Calendar,
  Smartphone,
  Monitor,
  Tablet,
  ShoppingCart,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCurrency } from '@/components/providers';
import { DashboardBanner } from '@/components/notifications';

interface DashboardStats {
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

interface TimeSeriesData {
  date: string;
  views: number;
  revenue: number;
  sales: number;
  downloads: number;
}

interface TopEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  totalViews: number;
  totalRevenue: number;
  conversionRate: number;
}

interface DeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
}

interface TrafficSource {
  source: string;
  count: number;
  percentage: number;
}

type TimeRange = '7d' | '30d' | '90d' | '365d';

export default function AnalyticsPage() {
  const { formatPrice } = useCurrency();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [devices, setDevices] = useState<DeviceBreakdown>({ mobile: 0, desktop: 0, tablet: 0 });
  const [traffic, setTraffic] = useState<TrafficSource[]>([]);

  // Fetch analytics data
  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const response = await fetch(`/api/analytics?type=dashboard&range=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setTimeSeries(data.timeSeries || []);
        setTopEvents(data.topEvents || []);
        setDevices(data.devices || { mobile: 0, desktop: 0, tablet: 0 });
        setTraffic(data.traffic || []);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  // Calculate max for chart scaling
  const maxViews = Math.max(...timeSeries.map(d => d.views), 1);
  const maxRevenue = Math.max(...timeSeries.map(d => d.revenue), 1);
  
  // Device total for percentages
  const deviceTotal = devices.mobile + devices.desktop + devices.tablet;

  const statCards = stats ? [
    { 
      label: 'Total Views', 
      value: formatNumber(stats.totalViews), 
      icon: Eye,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    { 
      label: 'Unique Visitors', 
      value: formatNumber(stats.uniqueViews), 
      icon: Users,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    { 
      label: 'Total Revenue', 
      value: formatPrice(stats.totalRevenue), 
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    { 
      label: 'Conversion Rate', 
      value: `${stats.conversionRate.toFixed(1)}%`, 
      icon: ShoppingCart,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ] : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Ad Placement */}
      <DashboardBanner />
      
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="mt-1 text-secondary">
            Track your event performance, photo views, and revenue.
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-secondary hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        {(['7d', '30d', '90d', '365d'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              timeRange === range
                ? 'bg-foreground text-background'
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
          >
            {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : 'Year'}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-xl p-2.5 ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-secondary">{stat.label}</p>
              <p className="mt-1 text-3xl font-bold text-foreground tracking-tight">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Views Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-foreground">Views Over Time</h2>
          </div>
          
          {timeSeries.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No data yet. Upload photos to see analytics.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-64">
              {/* Simple bar chart */}
              <div className="flex items-end justify-between h-full gap-1">
                {timeSeries.slice(-30).map((day, index) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${new Date(day.date).toLocaleDateString()}: ${day.views} views`}
                  >
                    <div
                      className="w-full bg-accent/80 rounded-t transition-all hover:bg-accent"
                      style={{ 
                        height: `${(day.views / maxViews) * 100}%`,
                        minHeight: day.views > 0 ? '4px' : '0',
                      }}
                    />
                    {index % 7 === 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(day.date).getDate()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-6">Devices</h2>
          
          {deviceTotal === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No device data yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              <DeviceBar
                icon={<Smartphone className="h-4 w-4" />}
                label="Mobile"
                value={devices.mobile}
                total={deviceTotal}
                color="bg-blue-500"
              />
              <DeviceBar
                icon={<Monitor className="h-4 w-4" />}
                label="Desktop"
                value={devices.desktop}
                total={deviceTotal}
                color="bg-green-500"
              />
              <DeviceBar
                icon={<Tablet className="h-4 w-4" />}
                label="Tablet"
                value={devices.tablet}
                total={deviceTotal}
                color="bg-purple-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Top Events and Traffic */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Events */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Top Performing Events</h2>
          </div>
          
          {topEvents.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No events yet. Create your first event to start tracking.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {topEvents.map((event, index) => (
                <a
                  key={event.eventId}
                  href={`/dashboard/events/${event.eventId}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{event.eventName}</p>
                    <p className="text-sm text-secondary">
                      {new Date(event.eventDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">{formatNumber(event.totalViews)} views</p>
                    <p className="text-sm text-success">{formatPrice(event.totalRevenue)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Traffic Sources */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-foreground">Traffic Sources</h2>
          </div>
          
          {traffic.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No traffic data yet.
              </p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {traffic.map((source) => (
                <div key={source.source} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{source.source}</span>
                    <span className="text-sm text-secondary">{source.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${source.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-foreground">Revenue Over Time</h2>
        </div>
        
        {timeSeries.length === 0 || maxRevenue === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <div className="text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No revenue data yet. Start selling to see earnings.
              </p>
            </div>
          </div>
        ) : (
          <div className="h-48">
            <div className="flex items-end justify-between h-full gap-1">
              {timeSeries.slice(-30).map((day, index) => (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${new Date(day.date).toLocaleDateString()}: ${formatPrice(day.revenue)}`}
                >
                  <div
                    className="w-full bg-green-500/80 rounded-t transition-all hover:bg-green-500"
                    style={{ 
                      height: `${(day.revenue / maxRevenue) * 100}%`,
                      minHeight: day.revenue > 0 ? '4px' : '0',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper components
function DeviceBar({ 
  icon, 
  label, 
  value, 
  total, 
  color 
}: { 
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-sm text-secondary">{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
