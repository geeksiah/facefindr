import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getRecurringSubscriptionStatus } from '@/lib/payments/flutterwave';
import { getBillingSubscription } from '@/lib/payments/paypal';
import { getPaystackSubscriptionStatus, resolvePaystackSecretKey } from '@/lib/payments/paystack';
import {
  readNumber,
  readString,
  syncRecurringSubscriptionRecord,
  type SubscriptionScope,
} from '@/lib/payments/recurring-sync';
import { mapProviderSubscriptionStatusToLocal } from '@/lib/payments/recurring-subscriptions';
import { createServiceClient } from '@/lib/supabase/server';

const CRON_SECRET = process.env.CRON_SECRET;

interface ReconcileRowBase {
  id: string;
  status: string;
  payment_provider: string | null;
  external_subscription_id: string | null;
  external_customer_id?: string | null;
  external_plan_id?: string | null;
  billing_cycle?: string | null;
  currency?: string | null;
  amount_cents?: number | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CreatorRow extends ReconcileRowBase {
  photographer_id: string;
  plan_code: string;
  plan_id: string | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: string | null;
}

interface AttendeeRow extends ReconcileRowBase {
  attendee_id: string;
  plan_code: string;
  canceled_at?: string | null;
}

interface VaultRow extends ReconcileRowBase {
  user_id: string;
  plan_id: string | null;
  price_paid?: number | null;
  cancelled_at?: string | null;
}

export async function POST(request: Request) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured. Endpoint is disabled.' },
        { status: 503 }
      );
    }

    const headersList = await headers();
    const authHeader = headersList.get('authorization');

    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedProvider = readString(searchParams.get('provider'));
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);

    const supabase = createServiceClient();

    const [creatorRows, attendeeRows, vaultRows] = await Promise.all([
      fetchCreatorRows(supabase, limit, requestedProvider),
      fetchAttendeeRows(supabase, limit, requestedProvider),
      fetchVaultRows(supabase, limit, requestedProvider),
    ]);

    const result = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{ scope: SubscriptionScope; id: string; provider: string; action: string; note?: string }>,
    };

    for (const row of creatorRows) {
      await reconcileSubscriptionRow({
        supabase,
        scope: 'creator_subscription',
        row,
        result,
      });
    }

    for (const row of attendeeRows) {
      await reconcileSubscriptionRow({
        supabase,
        scope: 'attendee_subscription',
        row,
        result,
      });
    }

    for (const row of vaultRows) {
      await reconcileSubscriptionRow({
        supabase,
        scope: 'vault_subscription',
        row,
        result,
      });
    }

    return NextResponse.json({
      success: true,
      provider: requestedProvider || 'all',
      limit,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Subscription reconcile error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Subscription reconcile failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function fetchCreatorRows(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
  provider?: string | null
) {
  let query = supabase
    .from('subscriptions')
    .select(
      'id, photographer_id, plan_code, plan_id, status, payment_provider, external_subscription_id, external_customer_id, external_plan_id, billing_cycle, currency, amount_cents, current_period_start, current_period_end, cancel_at_period_end, canceled_at, metadata'
    )
    .not('external_subscription_id', 'is', null)
    .limit(limit);

  if (provider) {
    query = query.eq('payment_provider', provider);
  } else {
    query = query.in('payment_provider', ['paypal', 'flutterwave', 'paystack']);
  }

  const { data } = await query;
  return (data || []) as CreatorRow[];
}

async function fetchAttendeeRows(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
  provider?: string | null
) {
  let query = supabase
    .from('attendee_subscriptions')
    .select(
      'id, attendee_id, plan_code, status, payment_provider, external_subscription_id, external_customer_id, external_plan_id, billing_cycle, currency, amount_cents, current_period_start, current_period_end, canceled_at, metadata'
    )
    .not('external_subscription_id', 'is', null)
    .limit(limit);

  if (provider) {
    query = query.eq('payment_provider', provider);
  } else {
    query = query.in('payment_provider', ['paypal', 'flutterwave', 'paystack']);
  }

  const { data } = await query;
  return (data || []) as AttendeeRow[];
}

async function fetchVaultRows(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
  provider?: string | null
) {
  let query = supabase
    .from('storage_subscriptions')
    .select(
      'id, user_id, plan_id, status, payment_provider, external_subscription_id, external_customer_id, external_plan_id, billing_cycle, currency, amount_cents, price_paid, current_period_start, current_period_end, cancelled_at, metadata'
    )
    .not('external_subscription_id', 'is', null)
    .limit(limit);

  if (provider) {
    query = query.eq('payment_provider', provider);
  } else {
    query = query.in('payment_provider', ['paypal', 'flutterwave', 'paystack']);
  }

  const { data } = await query;
  return (data || []) as VaultRow[];
}

async function reconcileSubscriptionRow(params: {
  supabase: ReturnType<typeof createServiceClient>;
  scope: SubscriptionScope;
  row: CreatorRow | AttendeeRow | VaultRow;
  result: {
    processed: number;
    updated: number;
    skipped: number;
    errors: number;
    details: Array<{ scope: SubscriptionScope; id: string; provider: string; action: string; note?: string }>;
  };
}) {
  const { supabase, scope, row, result } = params;
  const provider = readString(row.payment_provider) || 'unknown';
  const externalSubscriptionId = readString(row.external_subscription_id);

  result.processed += 1;

  if (!externalSubscriptionId || !['paypal', 'flutterwave', 'paystack'].includes(provider)) {
    result.skipped += 1;
    result.details.push({ scope, id: row.id, provider, action: 'skipped', note: 'Unsupported provider or missing external id' });
    return;
  }

  try {
    const providerLookup = await fetchProviderStatus({ provider, externalSubscriptionId, metadata: row.metadata });
    if (!providerLookup) {
      result.skipped += 1;
      result.details.push({ scope, id: row.id, provider, action: 'skipped', note: 'Provider status lookup failed' });
      return;
    }

    const mappedStatus = mapProviderSubscriptionStatusToLocal(providerLookup.status, scope);
    if (!mappedStatus) {
      result.skipped += 1;
      result.details.push({
        scope,
        id: row.id,
        provider,
        action: 'skipped',
        note: `Unmapped provider status: ${providerLookup.status}`,
      });
      return;
    }

    const isCancelled = mappedStatus === 'canceled' || mappedStatus === 'cancelled';

    await syncRecurringSubscriptionRecord({
      supabase,
      provider: provider as 'paypal' | 'flutterwave' | 'paystack',
      scope,
      status: mappedStatus,
      eventType: 'cron.reconcile',
      externalSubscriptionId: providerLookup.externalSubscriptionId || externalSubscriptionId,
      externalCustomerId: row.external_customer_id || null,
      externalPlanId: providerLookup.externalPlanId || row.external_plan_id || null,
      billingCycle: row.billing_cycle || null,
      currency: row.currency || 'USD',
      amountCents:
        row.amount_cents ??
        (scope === 'vault_subscription'
          ? Math.round((readNumber((row as VaultRow).price_paid) || 0) * 100)
          : null),
      currentPeriodStart: row.current_period_start || null,
      currentPeriodEnd: row.current_period_end || null,
      cancelAtPeriodEnd:
        scope === 'vault_subscription'
          ? isCancelled
          : scope === 'creator_subscription'
          ? Boolean((row as CreatorRow).cancel_at_period_end)
          : Boolean(
              (row as AttendeeRow).metadata &&
                typeof (row as AttendeeRow).metadata === 'object' &&
                (row as AttendeeRow).metadata?.cancel_at_period_end === true
            ),
      canceledAt:
        isCancelled
          ? new Date().toISOString()
          : scope === 'vault_subscription'
            ? (row as VaultRow).cancelled_at || null
            : (row as CreatorRow | AttendeeRow).canceled_at || null,
      photographerId: scope === 'creator_subscription' ? (row as CreatorRow).photographer_id : null,
      attendeeId: scope === 'attendee_subscription' ? (row as AttendeeRow).attendee_id : null,
      userId: scope === 'vault_subscription' ? (row as VaultRow).user_id : null,
      planCode:
        scope === 'creator_subscription' || scope === 'attendee_subscription'
          ? (row as CreatorRow | AttendeeRow).plan_code
          : null,
      planId:
        scope === 'vault_subscription'
          ? (row as VaultRow).plan_id
          : (row as CreatorRow).plan_id || null,
      metadata: {
        ...(row.metadata || {}),
        reconcile_provider_status: providerLookup.status,
      },
    });

    result.updated += 1;
    result.details.push({ scope, id: row.id, provider, action: 'updated' });
  } catch (error) {
    result.errors += 1;
    result.details.push({
      scope,
      id: row.id,
      provider,
      action: 'error',
      note: error instanceof Error ? error.message : 'Unknown reconciliation error',
    });
  }
}

async function fetchProviderStatus(params: {
  provider: string;
  externalSubscriptionId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const { provider, externalSubscriptionId, metadata } = params;

  if (provider === 'paypal') {
    const subscription = await getBillingSubscription(externalSubscriptionId);
    return {
      status: subscription.status,
      externalSubscriptionId: subscription.id,
      externalPlanId: subscription.plan_id || null,
    };
  }

  if (provider === 'flutterwave') {
    const subscription = await getRecurringSubscriptionStatus(externalSubscriptionId);
    return {
      status: subscription.status,
      externalSubscriptionId: subscription.id || externalSubscriptionId,
      externalPlanId: null,
    };
  }

  if (provider === 'paystack') {
    const metadataRecord = metadata || {};
    const regionCode = readString((metadataRecord as Record<string, unknown>).region_code) || undefined;
    const secret = await resolvePaystackSecretKey(regionCode);
    const subscription = await getPaystackSubscriptionStatus(externalSubscriptionId, secret || undefined);
    return {
      status: subscription.status,
      externalSubscriptionId: subscription.subscription_code || externalSubscriptionId,
      externalPlanId: null,
    };
  }

  return null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
