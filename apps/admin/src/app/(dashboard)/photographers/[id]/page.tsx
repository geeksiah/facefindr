import { 
  ArrowLeft, 
  Mail, 
  Calendar, 
  CreditCard, 
  Image, 
  DollarSign,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { supabaseAdmin } from '@/lib/supabase';
import { formatDate, formatDateTime, formatCurrency, getInitials } from '@/lib/utils';

async function getPhotographer(id: string) {
  const { data: photographer, error } = await supabaseAdmin
    .from('photographers')
    .select(`
      *,
      subscriptions (
        *
      ),
      wallets (
        *
      ),
      events (
        id,
        name,
        status,
        created_at,
        media (id)
      )
    `)
    .eq('id', id)
    .single();

  if (error || !photographer) {
    return null;
  }

  // Get transactions summary
  const eventIds = photographer.events?.map((e: any) => e.id) || [];
  
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('gross_amount, net_amount, platform_fee, status')
    .in('event_id', eventIds.length > 0 ? eventIds : ['00000000-0000-0000-0000-000000000000']);

  const transactionSummary = transactions?.reduce(
    (acc, t) => {
      if (t.status === 'succeeded') {
        acc.totalGross += t.gross_amount || 0;
        acc.totalNet += t.net_amount || 0;
        acc.totalFees += t.platform_fee || 0;
        acc.count += 1;
      }
      return acc;
    },
    { totalGross: 0, totalNet: 0, totalFees: 0, count: 0 }
  ) || { totalGross: 0, totalNet: 0, totalFees: 0, count: 0 };

  // Get payouts
  const walletIds = photographer.wallets?.map((w: any) => w.id) || [];
  
  const { data: payouts } = await supabaseAdmin
    .from('payouts')
    .select('*')
    .in('wallet_id', walletIds.length > 0 ? walletIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    ...photographer,
    transactionSummary,
    payouts: payouts || [],
  };
}

export default async function PhotographerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const photographer = await getPhotographer(id);

  if (!photographer) {
    notFound();
  }

  const totalPhotos = photographer.events?.reduce(
    (sum: number, e: any) => sum + (e.media?.length || 0),
    0
  ) || 0;

  // Get wallet balance from view
  const walletId = photographer.wallets?.[0]?.id;
  let balance = 0;
  if (walletId) {
    const { data: walletBalance } = await supabaseAdmin
      .from('wallet_balances')
      .select('available_balance')
      .eq('wallet_id', walletId)
      .single();
    balance = walletBalance?.available_balance || 0;
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/photographers"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Photographers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {photographer.profile_photo_url ? (
            <img
              src={photographer.profile_photo_url}
              alt=""
              className="w-20 h-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-2xl font-bold text-foreground">
              {getInitials(photographer.display_name || photographer.email)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {photographer.display_name || 'No name'}
            </h1>
            {photographer.business_name && (
              <p className="text-muted-foreground">{photographer.business_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                photographer.status === 'active' ? 'bg-green-500/10 text-green-500' :
                photographer.status === 'suspended' ? 'bg-red-500/10 text-red-500' :
                'bg-yellow-500/10 text-yellow-500'
              }`}>
                {photographer.status.replace('_', ' ')}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                photographer.subscriptions?.plan_code === 'studio' ? 'bg-orange-500/10 text-orange-500' :
                photographer.subscriptions?.plan_code === 'pro' ? 'bg-purple-500/10 text-purple-500' :
                photographer.subscriptions?.plan_code === 'starter' ? 'bg-blue-500/10 text-blue-500' :
                'bg-gray-500/10 text-gray-500'
              }`}>
                {photographer.subscriptions?.plan_code || 'Free'} Plan
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={Calendar}
          label="Events"
          value={photographer.events?.length || 0}
        />
        <StatCard
          icon={Image}
          label="Total Photos"
          value={totalPhotos}
        />
        <StatCard
          icon={DollarSign}
          label="Total Earnings"
          value={formatCurrency(photographer.transactionSummary.totalNet)}
        />
        <StatCard
          icon={CreditCard}
          label="Available Balance"
          value={formatCurrency(balance)}
        />
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account Info */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Account Information</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground flex items-center gap-2">
                {photographer.email}
                {photographer.email_verified ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Joined</dt>
              <dd className="text-foreground">{formatDate(photographer.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd className="text-foreground">{formatDateTime(photographer.updated_at)}</dd>
            </div>
            {photographer.face_tag && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">FaceTag</dt>
                <dd className="text-foreground font-mono">{photographer.face_tag}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Subscription Info */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Subscription</h2>
          {photographer.subscriptions ? (
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="text-foreground capitalize">{photographer.subscriptions.plan_code}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-foreground capitalize">{photographer.subscriptions.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Period End</dt>
                <dd className="text-foreground">
                  {formatDate(photographer.subscriptions.current_period_end)}
                </dd>
              </div>
              {photographer.subscriptions.stripe_subscription_id && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Stripe ID</dt>
                  <dd className="text-foreground font-mono text-sm">
                    {photographer.subscriptions.stripe_subscription_id}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground">No active subscription</p>
          )}
        </div>

        {/* Recent Events */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Recent Events</h2>
          {photographer.events?.length > 0 ? (
            <div className="space-y-3">
              {photographer.events.slice(0, 5).map((event: any) => (
                <div key={event.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-foreground font-medium">{event.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.media?.length || 0} photos · {formatDate(event.created_at)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    event.status === 'active' ? 'bg-green-500/10 text-green-500' :
                    event.status === 'closed' ? 'bg-gray-500/10 text-gray-500' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {event.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No events yet</p>
          )}
        </div>

        {/* Recent Payouts */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Recent Payouts</h2>
          {photographer.payouts?.length > 0 ? (
            <div className="space-y-3">
              {photographer.payouts.slice(0, 5).map((payout: any) => (
                <div key={payout.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-foreground font-medium">
                      {formatCurrency(payout.amount, payout.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(payout.created_at)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    payout.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                    payout.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {payout.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No payouts yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
