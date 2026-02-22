import { 
  DollarSign, 
  Users, 
  CreditCard, 
  Calendar,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';
import { Suspense } from 'react';

import {
  convertToBaseAmount,
  loadUsdRates,
  resolvePlatformBaseCurrency,
} from '@/lib/finance/currency';
import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatNumber } from '@/lib/utils';

import { RealtimeStats } from './realtime-stats';
import { RecentActivity } from './recent-activity';

async function getStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const baseCurrency = await resolvePlatformBaseCurrency();

  // Get all stats in parallel
  const [
    totalRevenueResult,
    totalCreditRevenueResult,
    monthlyRevenueResult,
    monthlyCreditRevenueResult,
    lastMonthRevenueResult,
    lastMonthCreditRevenueResult,
    photographersResult,
    newCreatorsResult,
    attendeesResult,
    newAttendeesResult,
    pendingPayoutsResult,
    activeEventsResult,
    todayTransactionsResult,
    todayCreditPurchasesResult,
  ] = await Promise.all([
    // Total revenue all time
    supabaseAdmin
      .from('transactions')
      .select('gross_amount, currency')
      .eq('status', 'succeeded'),

    // Total drop-in credit purchases all time
    supabaseAdmin
      .from('drop_in_credit_purchases')
      .select('amount_paid, currency')
      .in('status', ['active', 'exhausted']),
    
    // This month's revenue
    supabaseAdmin
      .from('transactions')
      .select('gross_amount, currency')
      .eq('status', 'succeeded')
      .gte('created_at', thisMonth.toISOString()),

    // This month's drop-in purchases
    supabaseAdmin
      .from('drop_in_credit_purchases')
      .select('amount_paid, currency')
      .in('status', ['active', 'exhausted'])
      .gte('created_at', thisMonth.toISOString()),
    
    // Last month's revenue
    supabaseAdmin
      .from('transactions')
      .select('gross_amount, currency')
      .eq('status', 'succeeded')
      .gte('created_at', lastMonth.toISOString())
      .lt('created_at', thisMonth.toISOString()),

    // Last month's drop-in purchases
    supabaseAdmin
      .from('drop_in_credit_purchases')
      .select('amount_paid, currency')
      .in('status', ['active', 'exhausted'])
      .gte('created_at', lastMonth.toISOString())
      .lt('created_at', thisMonth.toISOString()),
    
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
      .select('available_balance, currency'),
    
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

    // Today's drop-in purchases
    supabaseAdmin
      .from('drop_in_credit_purchases')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'exhausted'])
      .gte('created_at', today.toISOString()),
  ]);

  const allCurrencies = new Set<string>([baseCurrency]);
  for (const row of totalRevenueResult.data || []) allCurrencies.add(String((row as any).currency || baseCurrency).toUpperCase());
  for (const row of totalCreditRevenueResult.data || []) allCurrencies.add(String((row as any).currency || baseCurrency).toUpperCase());
  for (const row of pendingPayoutsResult.data || []) allCurrencies.add(String((row as any).currency || baseCurrency).toUpperCase());
  const usdRates = await loadUsdRates(Array.from(allCurrencies));

  const sumConverted = (rows: any[] | null | undefined, amountKey: string) =>
    (rows || []).reduce((sum, row) => {
      const amount = Number((row as any)[amountKey] || 0);
      const currency = String((row as any).currency || baseCurrency).toUpperCase();
      return sum + convertToBaseAmount(amount, currency, baseCurrency, usdRates);
    }, 0);

  // Calculate totals in platform base currency
  const totalRevenue =
    sumConverted(totalRevenueResult.data, 'gross_amount') +
    sumConverted(totalCreditRevenueResult.data, 'amount_paid');
  const monthlyRevenue =
    sumConverted(monthlyRevenueResult.data, 'gross_amount') +
    sumConverted(monthlyCreditRevenueResult.data, 'amount_paid');
  const lastMonthRevenue =
    sumConverted(lastMonthRevenueResult.data, 'gross_amount') +
    sumConverted(lastMonthCreditRevenueResult.data, 'amount_paid');
  const revenueChange = lastMonthRevenue > 0 
    ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
    : '0';

  const pendingPayoutsTotal = (pendingPayoutsResult.data || []).reduce((sum, balanceRow) => {
    const amount = Number((balanceRow as any).available_balance || 0);
    const currency = String((balanceRow as any).currency || baseCurrency).toUpperCase();
    return sum + convertToBaseAmount(amount, currency, baseCurrency, usdRates);
  }, 0);

  return {
    totalRevenue,
    monthlyRevenue,
    revenueChange: parseFloat(revenueChange),
    totalCreators: photographersResult.count || 0,
    newCreators: newCreatorsResult.count || 0,
    totalAttendees: attendeesResult.count || 0,
    newAttendees: newAttendeesResult.count || 0,
    pendingPayouts: pendingPayoutsTotal,
    activeEvents: activeEventsResult.count || 0,
    todayTransactions: (todayTransactionsResult.count || 0) + (todayCreditPurchasesResult.count || 0),
    baseCurrency,
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

  const normalizedTransactions = (transactions.data || []).map((t: any) => ({
    ...t,
    events: Array.isArray(t.events) ? t.events[0] || null : t.events || null,
  }));

  const normalizedPayouts = (payouts.data || []).map((p: any) => ({
    ...p,
    wallets: Array.isArray(p.wallets) ? p.wallets[0] || null : p.wallets || null,
  }));

  return {
    transactions: normalizedTransactions,
    newUsers: newUsers.data || [],
    payouts: normalizedPayouts,
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
          value={formatCurrency(stats.totalRevenue, stats.baseCurrency)}
          change={stats.revenueChange}
          changeLabel="vs last month"
          icon={DollarSign}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
        />
        <StatCard
          title="Active Users"
          value={formatNumber(stats.totalCreators + stats.totalAttendees)}
          subtitle={`${stats.newCreators + stats.newAttendees} new this month`}
          icon={Users}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <StatCard
          title="Pending Payouts"
          value={formatCurrency(stats.pendingPayouts, stats.baseCurrency)}
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
