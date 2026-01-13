import { BarChart3, TrendingUp, Users, DollarSign, Eye, Download, Calendar } from 'lucide-react';

export default function AnalyticsPage() {
  // Placeholder stats
  const stats = [
    { label: 'Total Views', value: '0', change: '+0%', icon: Eye },
    { label: 'Downloads', value: '0', change: '+0%', icon: Download },
    { label: 'Unique Visitors', value: '0', change: '+0%', icon: Users },
    { label: 'Revenue', value: '$0.00', change: '+0%', icon: DollarSign },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-secondary">
          Track your event performance, photo views, and revenue.
        </p>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2">
        <button className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium">
          7 Days
        </button>
        <button className="px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors">
          30 Days
        </button>
        <button className="px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors">
          90 Days
        </button>
        <button className="px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors">
          All Time
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-xl bg-muted p-2.5">
                <stat.icon className="h-5 w-5 text-foreground" />
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-success">
                <TrendingUp className="h-3.5 w-3.5" />
                {stat.change}
              </span>
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

      {/* Chart Placeholder */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-foreground">Views Over Time</h2>
          <select className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent">
            <option>All Events</option>
          </select>
        </div>
        <div className="h-64 rounded-xl bg-muted/50 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No data yet. Upload photos to see analytics.
            </p>
          </div>
        </div>
      </div>

      {/* Top Events */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Top Performing Events</h2>
        </div>
        <div className="p-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No events yet. Create your first event to start tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
