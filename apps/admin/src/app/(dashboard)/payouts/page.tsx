import { 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Pause,
  Play,
} from 'lucide-react';
import { Suspense } from 'react';

import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatNumber } from '@/lib/utils';

import { PayoutActions } from './payout-actions';
import { PayoutQueue } from './payout-queue';

async function getPayoutStats() {
  // Get pending balances by currency
  const { data: balances } = await supabaseAdmin
    .from('wallet_balances')
    .select(`
      available_balance,
      currency,
      wallets (
        provider,
        momo_provider
      )
    `)
    .gt('available_balance', 0);

  // Aggregate by currency and provider
  const byCurrency: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let totalPending = 0;
  let pendingCount = 0;

  balances?.forEach((b) => {
    const currency = b.currency || 'USD';
    const wallet = Array.isArray(b.wallets) ? b.wallets[0] : b.wallets;
    const provider = wallet?.provider || 'stripe';
    
    byCurrency[currency] = (byCurrency[currency] || 0) + b.available_balance;
    byProvider[provider] = (byProvider[provider] || 0) + b.available_balance;
    totalPending += b.available_balance;
    if (b.available_balance > 0) pendingCount++;
  });

  // Get recent payout stats
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const { data: recentPayouts } = await supabaseAdmin
    .from('payouts')
    .select('amount, status')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const completed = recentPayouts?.filter(p => p.status === 'completed') || [];
  const failed = recentPayouts?.filter(p => p.status === 'failed') || [];
  
  const totalCompleted = completed.reduce((sum, p) => sum + p.amount, 0);
  const successRate = recentPayouts && recentPayouts.length > 0
    ? (completed.length / recentPayouts.length * 100)
    : 100;

  // Get global payout setting
  const { data: setting } = await supabaseAdmin
    .from('platform_settings')
    .select('value')
    .eq('setting_key', 'payouts_enabled')
    .single();

  const payoutsEnabled = setting?.value === 'true' || setting?.value === true;

  return {
    totalPending,
    pendingCount,
    byCurrency: Object.entries(byCurrency).map(([currency, amount]) => ({ currency, amount })),
    byProvider: Object.entries(byProvider).map(([provider, amount]) => ({ provider, amount })),
    totalCompleted30d: totalCompleted,
    failedCount30d: failed.length,
    successRate,
    payoutsEnabled,
  };
}

async function getPendingPayouts() {
  const { data } = await supabaseAdmin
    .from('wallet_balances')
    .select(`
      *,
      wallets:wallet_id (
        id,
        provider,
        momo_provider,
        momo_account_number,
        photographers:photographer_id (
          id,
          display_name,
          email
        )
      )
    `)
    .gt('available_balance', 0)
    .order('available_balance', { ascending: false })
    .limit(50);

  return data || [];
}

export default async function PayoutsPage() {
  const [stats, pendingPayouts] = await Promise.all([
    getPayoutStats(),
    getPendingPayouts(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground mt-1">
            Process photographer payouts and manage payout settings
          </p>
        </div>
        <PayoutActions payoutsEnabled={stats.payoutsEnabled} />
      </div>

      {/* Status Banner */}
      {!stats.payoutsEnabled && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <Pause className="h-5 w-5 text-yellow-500" />
          <p className="text-yellow-500 font-medium">
            Automatic payouts are currently paused
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
          label="Pending Payouts"
          value={formatCurrency(stats.totalPending)}
          subtitle={`${stats.pendingCount} photographers`}
        />
        <StatCard
          icon={CheckCircle}
          iconColor="text-green-500"
          iconBg="bg-green-500/10"
          label="Completed (30d)"
          value={formatCurrency(stats.totalCompleted30d)}
          subtitle={`${stats.successRate.toFixed(1)}% success rate`}
        />
        <StatCard
          icon={XCircle}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
          label="Failed (30d)"
          value={stats.failedCount30d.toString()}
          subtitle="Needs attention"
        />
        <StatCard
          icon={DollarSign}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
          label="By Provider"
          value={stats.byProvider.length.toString()}
          subtitle="Active providers"
        />
      </div>

      {/* Breakdown Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Currency */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Pending by Currency</h2>
          {stats.byCurrency.length === 0 ? (
            <p className="text-muted-foreground">No pending payouts</p>
          ) : (
            <div className="space-y-3">
              {stats.byCurrency.map(({ currency, amount }) => (
                <div key={currency} className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{currency}</span>
                  <span className="text-muted-foreground">
                    {formatCurrency(amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Provider */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Pending by Provider</h2>
          {stats.byProvider.length === 0 ? (
            <p className="text-muted-foreground">No pending payouts</p>
          ) : (
            <div className="space-y-3">
              {stats.byProvider.map(({ provider, amount }) => (
                <div key={provider} className="flex items-center justify-between">
                  <span className="font-medium text-foreground capitalize">{provider}</span>
                  <span className="text-muted-foreground">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payout Queue */}
      <Suspense fallback={<QueueLoading />}>
        <PayoutQueue payouts={pendingPayouts} />
      </Suspense>
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  subtitle: string;
}

function StatCard({ icon: Icon, iconColor, iconBg, label, value, subtitle }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2.5 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function QueueLoading() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="grid animate-pulse grid-cols-12 gap-4 border-b border-border pb-3 last:border-0">
            <div className="col-span-3 h-4 rounded bg-muted" />
            <div className="col-span-3 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
