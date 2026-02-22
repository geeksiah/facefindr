import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Calendar,
} from 'lucide-react';
import { Suspense } from 'react';

import {
  DEFAULT_BASE_CURRENCY,
  convertToBaseAmount,
  loadUsdRates,
  resolvePlatformBaseCurrency,
} from '@/lib/finance/currency';
import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatNumber } from '@/lib/utils';

import { AnalyticsCharts } from './charts';
import { ExportButton } from './export-button';

async function getAnalyticsData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const baseCurrency = await resolvePlatformBaseCurrency();

  // Get revenue by day for last 30 days
  const { data: revenueByDay } = await supabaseAdmin
    .from('transactions')
    .select('gross_amount, platform_fee, currency, metadata, created_at')
    .eq('status', 'succeeded')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  const { data: creditsByDay } = await supabaseAdmin
    .from('drop_in_credit_purchases')
    .select('amount_paid, currency, status, created_at')
    .in('status', ['active', 'exhausted'])
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  const transactionCurrencies = new Set<string>();
  for (const row of revenueByDay || []) {
    transactionCurrencies.add(String((row as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase());
  }
  for (const row of creditsByDay || []) {
    transactionCurrencies.add(String((row as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase());
  }
  transactionCurrencies.add(baseCurrency);
  const usdRates = await loadUsdRates(Array.from(transactionCurrencies));

  // Aggregate by day
  const dailyRevenue: Record<string, { gross: number; fees: number; count: number }> = {};
  revenueByDay?.forEach((tx) => {
    const day = tx.created_at.split('T')[0];
    if (!dailyRevenue[day]) {
      dailyRevenue[day] = { gross: 0, fees: 0, count: 0 };
    }
    const currency = String((tx as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase();
    dailyRevenue[day].gross += convertToBaseAmount(Number(tx.gross_amount || 0), currency, baseCurrency, usdRates);
    dailyRevenue[day].fees += convertToBaseAmount(Number(tx.platform_fee || 0), currency, baseCurrency, usdRates);
    dailyRevenue[day].count += 1;
  });
  creditsByDay?.forEach((creditPurchase) => {
    const day = creditPurchase.created_at.split('T')[0];
    if (!dailyRevenue[day]) {
      dailyRevenue[day] = { gross: 0, fees: 0, count: 0 };
    }
    const currency = String((creditPurchase as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase();
    const amount = convertToBaseAmount(Number(creditPurchase.amount_paid || 0), currency, baseCurrency, usdRates);
    dailyRevenue[day].gross += amount;
    dailyRevenue[day].count += 1;
  });

  // Get revenue by transaction type (last 90 days)
  const { data: revenueByTypeRows } = await supabaseAdmin
    .from('transactions')
    .select('gross_amount, currency, metadata')
    .eq('status', 'succeeded')
    .gte('created_at', ninetyDaysAgo.toISOString());

  const { data: creditsByTypeRows } = await supabaseAdmin
    .from('drop_in_credit_purchases')
    .select('amount_paid, currency, status')
    .in('status', ['active', 'exhausted'])
    .gte('created_at', ninetyDaysAgo.toISOString());

  const transactionTypeTotals: Record<string, number> = {};
  revenueByTypeRows?.forEach((tx) => {
    const metadata = (tx as any).metadata as Record<string, unknown> | null;
    const rawType = typeof metadata?.type === 'string' ? metadata.type : 'photo_purchase';
    const transactionType = rawType === 'tip' ? 'tip' : rawType;
    const currency = String((tx as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase();
    const amount = convertToBaseAmount(Number(tx.gross_amount || 0), currency, baseCurrency, usdRates);
    transactionTypeTotals[transactionType] = (transactionTypeTotals[transactionType] || 0) + amount;
  });
  creditsByTypeRows?.forEach((creditPurchase) => {
    const currency = String((creditPurchase as any).currency || DEFAULT_BASE_CURRENCY).toUpperCase();
    const amount = convertToBaseAmount(Number(creditPurchase.amount_paid || 0), currency, baseCurrency, usdRates);
    transactionTypeTotals.drop_in_credit_purchase =
      (transactionTypeTotals.drop_in_credit_purchase || 0) + amount;
  });

  // Get user growth
  const { data: photographersByDay } = await supabaseAdmin
    .from('photographers')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  const { data: attendeesByDay } = await supabaseAdmin
    .from('attendees')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true });

  // Aggregate user growth by day
  const userGrowth: Record<string, { photographers: number; attendees: number }> = {};
  photographersByDay?.forEach((p) => {
    const day = p.created_at.split('T')[0];
    if (!userGrowth[day]) userGrowth[day] = { photographers: 0, attendees: 0 };
    userGrowth[day].photographers += 1;
  });
  attendeesByDay?.forEach((a) => {
    const day = a.created_at.split('T')[0];
    if (!userGrowth[day]) userGrowth[day] = { photographers: 0, attendees: 0 };
    userGrowth[day].attendees += 1;
  });

  // Get event stats
  const { data: eventsByStatus } = await supabaseAdmin
    .from('events')
    .select('status');

  const eventStatusCounts: Record<string, number> = {};
  eventsByStatus?.forEach((e) => {
    eventStatusCounts[e.status] = (eventStatusCounts[e.status] || 0) + 1;
  });

  // Get subscription breakdown
  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_code, status');

  const subscriptionsByPlan: Record<string, number> = {};
  subscriptions?.forEach((s) => {
    if (s.status === 'active') {
      subscriptionsByPlan[s.plan_code] = (subscriptionsByPlan[s.plan_code] || 0) + 1;
    }
  });

  // Calculate totals
  const totalRevenue = Object.values(dailyRevenue).reduce((sum, d) => sum + d.gross, 0);
  const totalFees = Object.values(dailyRevenue).reduce((sum, d) => sum + d.fees, 0);
  const totalTransactions = Object.values(dailyRevenue).reduce((sum, d) => sum + d.count, 0);

  return {
    dailyRevenue: Object.entries(dailyRevenue).map(([date, data]) => ({
      date,
      revenue: data.gross,
      fees: data.fees,
      transactions: data.count,
    })),
    providerTotals: Object.entries(transactionTypeTotals).map(([provider, amount]) => ({
      provider: provider.replaceAll('_', ' '),
      amount,
    })),
    userGrowth: Object.entries(userGrowth).map(([date, data]) => ({
      date,
      photographers: data.photographers,
      attendees: data.attendees,
    })),
    eventStatusCounts: Object.entries(eventStatusCounts).map(([status, count]) => ({
      status,
      count,
    })),
    subscriptionsByPlan: Object.entries(subscriptionsByPlan).map(([plan, count]) => ({
      plan,
      count,
    })),
    summary: {
      totalRevenue,
      totalFees,
      totalTransactions,
      avgTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      currency: baseCurrency,
    },
  };
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Platform performance metrics and trends
          </p>
        </div>
        <ExportButton data={data} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Revenue (30d)"
          value={formatCurrency(data.summary.totalRevenue, data.summary.currency)}
          icon={DollarSign}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
        />
        <SummaryCard
          title="Platform Fees (30d)"
          value={formatCurrency(data.summary.totalFees, data.summary.currency)}
          icon={TrendingUp}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <SummaryCard
          title="Transactions (30d)"
          value={formatNumber(data.summary.totalTransactions)}
          icon={Calendar}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
        />
        <SummaryCard
          title="Avg Transaction"
          value={formatCurrency(data.summary.avgTransactionValue, data.summary.currency)}
          icon={Users}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
        />
      </div>

      {/* Charts */}
      <Suspense fallback={<ChartsLoading />}>
        <AnalyticsCharts data={data} currencyCode={data.summary.currency} />
      </Suspense>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

function SummaryCard({ title, value, icon: Icon, iconColor, iconBg }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChartsLoading() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
      </div>
    </div>
  );
}
