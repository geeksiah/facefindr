import {
  Calendar,
  Image,
  DollarSign,
  Users,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
}

function StatCard({ title, value, change, changeType, icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-soft">
      <div className="flex items-center justify-between">
        <div className="rounded-xl bg-muted p-2.5">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        {change && (
          <span
            className={`flex items-center gap-1 text-sm font-medium ${
              changeType === 'positive'
                ? 'text-success'
                : changeType === 'negative'
                ? 'text-destructive'
                : 'text-secondary'
            }`}
          >
            {changeType === 'positive' && <TrendingUp className="h-3.5 w-3.5" />}
            {change}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-secondary">{title}</p>
        <p className="mt-1 text-3xl font-bold text-foreground tracking-tight">{value}</p>
      </div>
    </div>
  );
}

// ============================================
// RECENT EVENTS LIST
// ============================================

interface RecentEvent {
  id: string;
  name: string;
  date: string;
  photos: number;
  status: 'draft' | 'active' | 'closed';
}

function RecentEventsList({ events }: { events: RecentEvent[] }) {
  const statusStyles = {
    draft: 'bg-muted text-muted-foreground',
    active: 'bg-success/10 text-success',
    closed: 'bg-warning/10 text-warning',
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-2xl bg-muted p-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">No events yet</h3>
        <p className="mt-1 text-sm text-secondary">Get started by creating your first event.</p>
        <Button asChild className="mt-6" variant="primary">
          <Link href="/dashboard/events/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/dashboard/events/${event.id}`}
          className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
              <Calendar className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">{event.name}</p>
              <div className="flex items-center gap-2 text-sm text-secondary">
                <Clock className="h-3.5 w-3.5" />
                <span>{event.date}</span>
                <span className="text-muted-foreground">·</span>
                <span>{event.photos} photos</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                statusStyles[event.status]
              }`}
            >
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============================================
// DASHBOARD PAGE
// ============================================

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Get user's event IDs first
  const { data: userEvents } = await supabase
    .from('events')
    .select('id')
    .eq('photographer_id', user.id);
  
  const eventIds = userEvents?.map((e) => e.id) || [];

  // Calculate date ranges for month comparison
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Fetch dashboard stats
  const [eventsResult, photosResult, transactionsResult, lastMonthTransactions] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, event_date, status, media(id)', { count: 'exact' })
      .eq('photographer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('media')
      .select('id', { count: 'exact' })
      .in('event_id', eventIds.length > 0 ? eventIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('transactions')
      .select('gross_amount, net_amount, created_at')
      .eq('status', 'succeeded')
      .in('event_id', eventIds.length > 0 ? eventIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('transactions')
      .select('net_amount')
      .eq('status', 'succeeded')
      .in('event_id', eventIds.length > 0 ? eventIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', lastMonthStart.toISOString())
      .lt('created_at', lastMonthEnd.toISOString()),
  ]);

  // Calculate stats
  const totalEvents = eventsResult.count || 0;
  const activeEvents = eventsResult.data?.filter((e) => e.status === 'active').length || 0;
  const totalPhotos = photosResult.count || 0;
  const totalRevenue =
    transactionsResult.data?.reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0;

  // Calculate this month's revenue
  const thisMonthRevenue = transactionsResult.data
    ?.filter((t) => new Date(t.created_at) >= thisMonthStart)
    .reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0;

  // Calculate last month's revenue
  const lastMonthRevenue = lastMonthTransactions.data
    ?.reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0;

  // Calculate percentage change
  let revenueChange: string | undefined;
  let changeType: 'positive' | 'negative' | 'neutral' | undefined;
  
  if (lastMonthRevenue > 0) {
    const changePercent = ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
    revenueChange = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;
    changeType = changePercent >= 0 ? 'positive' : 'negative';
  } else if (thisMonthRevenue > 0) {
    revenueChange = 'New';
    changeType = 'positive';
  }

  // Format recent events
  const recentEvents: RecentEvent[] =
    eventsResult.data?.map((event) => ({
      id: event.id,
      name: event.name,
      date: event.event_date
        ? new Date(event.event_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'No date set',
      photos: Array.isArray(event.media) ? event.media.length : 0,
      status: event.status as 'draft' | 'active' | 'closed',
    })) || [];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-secondary">
          Welcome back! Here&apos;s what&apos;s happening with your events.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Events"
          value={totalEvents.toString()}
          icon={Calendar}
        />
        <StatCard
          title="Active Events"
          value={activeEvents.toString()}
          icon={Users}
        />
        <StatCard
          title="Total Photos"
          value={totalPhotos.toLocaleString()}
          icon={Image}
        />
        <StatCard
          title="Total Revenue"
          value={`$${(totalRevenue / 100).toFixed(2)}`}
          change={revenueChange}
          changeType={changeType}
          icon={DollarSign}
        />
      </div>

      {/* Recent Events */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Recent Events</h2>
          <Link
            href="/dashboard/events"
            className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
          >
            View all
          </Link>
        </div>
        <Suspense
          fallback={
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          }
        >
          <RecentEventsList events={recentEvents} />
        </Suspense>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/events/new"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-soft hover:border-accent/20"
        >
          <div className="rounded-xl bg-accent/10 p-3 transition-colors group-hover:bg-accent/20">
            <Plus className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Create Event</h3>
            <p className="text-sm text-secondary">Set up a new photo event</p>
          </div>
        </Link>

        <Link
          href="/dashboard/upload"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-soft hover:border-accent/20"
        >
          <div className="rounded-xl bg-muted p-3 transition-colors group-hover:bg-accent/10">
            <Image className="h-6 w-6 text-foreground group-hover:text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Upload Photos</h3>
            <p className="text-sm text-secondary">Add photos to an event</p>
          </div>
        </Link>

        <Link
          href="/dashboard/analytics"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-soft hover:border-accent/20"
        >
          <div className="rounded-xl bg-muted p-3 transition-colors group-hover:bg-accent/10">
            <TrendingUp className="h-6 w-6 text-foreground group-hover:text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">View Analytics</h3>
            <p className="text-sm text-secondary">Track your performance</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
