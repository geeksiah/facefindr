import { 
  DollarSign, 
  Users, 
  CreditCard, 
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { Suspense } from 'react';

import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatDateTime } from '@/lib/utils';

import { RealtimeStats } from './realtime-stats';
import { RecentActivity } from './recent-activity';

async function getStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Get all stats in parallel
  const [
    totalRevenueResult,
    monthlyRevenueResult,
    lastMonthRevenueResult,
    photographersResult,
    newPhotographersResult,
    attendeesResult,
    newAttendeesResult,
    pendingPayoutsResult,
    activeEventsResult,
    todayTransactionsResult,
  ] = await Promise.all([
    // Total revenue all time
    supabaseAdmin
      .from('transactions')
      .select('gross_amount')
      .eq('status', 'succeeded'),
    
    // This month's revenue
    supabaseAdmin
      .from('transactions')
      .select('gross_amount')
      .eq('status', 'succeeded')
      .gte('created_at', thisMonth.toISOString()),
    
    // Last month's revenue
    supabaseAdmin
      .from('transactions')
      .select('gross_amount')
      .eq('status', 'succeeded')
      .gte('created_at', lastMonth.toISOString())
      .lt('created_at', lastMonthEnd.toISOString()),
    
    // Total photographers
    supabaseAdmin
      .from('photographers')
      .select('id', { count: 'exact', head: true }),
    
    // New photographers this month
    supabaseAdmin
      .from('photographers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thisMonth.toISOString()),
    
    // Total attendees
    supabaseAdmin
      .from('attendees')
      .select('id', { count: 'exact', head: true }),
    
    // New attendees this month
    supabaseAdmin
      .from('attendees')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thisMonth.toISOString()),
    
    // Pending payouts
    supabaseAdmin
      .from('wallet_balances')
      .select('available_balance'),
    
    // Active events
    supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    
    // Today's transactions
    supabaseAdmin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString()),
  ]);

  // Calculate totals
  const totalRevenue = totalRevenueResult.data?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0;
  const monthlyRevenue = monthlyRevenueResult.data?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0;
  const lastMonthRevenue = lastMonthRevenueResult.data?.reduce((sum, t) => sum + (t.gross_amount || 0), 0) || 0;
  const revenueChange = lastMonthRevenue > 0 
    ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
    : '0';

  const pendingPayoutsTotal = pendingPayoutsResult.data?.reduce(
    (sum, b) => sum + (b.available_balance || 0), 
    0
  ) || 0;

  return {
    totalRevenue,
    monthlyRevenue,
    revenueChange: parseFloat(revenueChange),
    totalPhotographers: photographersResult.count || 0,
    newPhotographers: newPhotographersResult.count || 0,
    totalAttendees: attendeesResult.count || 0,
    newAttendees: newAttendeesResult.count || 0,
    pendingPayouts: pendingPayoutsTotal,
    activeEvents: activeEventsResult.count || 0,
    todayTransactions: todayTransactionsResult.count || 0,
  };
}

async function getRecentActivity() {
  const [transactions, newUsers, payouts] = await Promise.all([
    // Recent transactions
    supabaseAdmin
      .from('transactions')
      .select(`
        id,
        gross_amount,
        status,
        created_at,
        events (name)
      `)
      .order('created_at', { ascending: false })
      .limit(5),
    
    // Recent users
    supabaseAdmin
      .from('photographers')
      .select('id, display_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    
    // Recent payouts
    supabaseAdmin
      .from('payouts')
      .select(`
        id,
        amount,
        currency,
        status,
        created_at,
        wallets (
          photographers (display_name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    transactions: transactions.data || [],
    newUsers: newUsers.data || [],
    payouts: payouts.data || [],
  };
}

export default async function DashboardPage() {
  const [stats, activity] = await Promise.all([
    getStats(),
    getRecentActivity(),
  ]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Platform overview and real-time metrics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          change={stats.revenueChange}
          changeLabel="vs last month"
          icon={DollarSign}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
        />
        <StatCard
          title="Active Users"
          value={formatNumber(stats.totalPhotographers + stats.totalAttendees)}
          subtitle={`${stats.newPhotographers + stats.newAttendees} new this month`}
          icon={Users}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <StatCard
          title="Pending Payouts"
          value={formatCurrency(stats.pendingPayouts)}
          subtitle={`${stats.todayTransactions} transactions today`}
          icon={CreditCard}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
        />
        <StatCard
          title="Active Events"
          value={stats.activeEvents.toString()}
          subtitle="Currently running"
          icon={Calendar}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
        />
      </div>

      {/* Realtime Stats */}
      <Suspense fallback={<StatsLoading />}>
        <RealtimeStats initialStats={stats} />
      </Suspense>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<ActivityLoading />}>
          <RecentActivity activity={activity} />
        </Suspense>
      </div>
    </div>
  );
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel, 
  subtitle, 
  icon: Icon, 
  iconColor, 
  iconBg 
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            change >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {change >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {(subtitle || changeLabel) && (
          <p className="text-xs text-muted-foreground mt-1">
            {subtitle || changeLabel}
          </p>
        )}
      </div>
    </div>
  );
}

function StatsLoading() {
  return (
    <div className="flex items-center justify-center h-32 rounded-xl border border-border bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ActivityLoading() {
  return (
    <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
