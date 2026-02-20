import { createServiceClient } from '@/lib/supabase/server';

export type SubscriptionScope =
  | 'creator_subscription'
  | 'attendee_subscription'
  | 'vault_subscription';

export interface RecurringSyncInput {
  supabase: ReturnType<typeof createServiceClient>;
  provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
  scope: SubscriptionScope;
  status: string;
  eventType?: string;
  externalSubscriptionId?: string | null;
  externalCustomerId?: string | null;
  externalPlanId?: string | null;
  billingCycle?: string | null;
  currency?: string | null;
  amountCents?: number | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  photographerId?: string | null;
  attendeeId?: string | null;
  userId?: string | null;
  planCode?: string | null;
  planId?: string | null;
  planSlug?: string | null;
  metadata?: Record<string, unknown>;
}

interface CreatorSubscriptionRow {
  id: string;
  plan_code: string | null;
  status: string | null;
  current_period_end: string | null;
  updated_at: string | null;
  created_at: string | null;
}

function normalizeBillingCycle(value?: string | null) {
  const normalized = String(value || 'monthly').toLowerCase();
  if (normalized === 'annual' || normalized === 'yearly') {
    return 'annual';
  }
  return 'monthly';
}

function normalizeCurrency(value?: string | null) {
  return String(value || 'USD').toUpperCase();
}

function normalizeStatus(scope: SubscriptionScope, rawStatus?: string | null) {
  const fallback = 'past_due';
  const normalized = String(rawStatus || '').toLowerCase() || fallback;

  if (scope === 'vault_subscription') {
    if (normalized === 'canceled') return 'cancelled';
    return normalized;
  }

  if (normalized === 'cancelled') return 'canceled';
  return normalized;
}

function parseAmountCents(amountCents?: number | null) {
  if (amountCents === null || amountCents === undefined || Number.isNaN(Number(amountCents))) {
    return null;
  }

  const value = Math.round(Number(amountCents));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function toIso(value?: string | number | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function scoreCreatorSubscription(row: CreatorSubscriptionRow): number {
  let score = 0;
  const status = String(row.status || '').toLowerCase();
  const planCode = String(row.plan_code || '').toLowerCase();

  if (status === 'active') score += 100;
  if (status === 'trialing') score += 80;
  if (planCode && planCode !== 'free') score += 20;
  if (row.current_period_end) score += 5;

  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : 0;
  const createdAt = row.created_at ? Date.parse(row.created_at) : 0;
  score += Math.floor((updatedAt || createdAt) / 1000000000);

  return score;
}

function pickPrimaryCreatorSubscription(rows: CreatorSubscriptionRow[]): CreatorSubscriptionRow | null {
  if (!rows.length) return null;
  return rows.reduce((best: CreatorSubscriptionRow | null, row) => {
    if (!best) return row;
    return scoreCreatorSubscription(row) > scoreCreatorSubscription(best) ? row : best;
  }, null);
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as any).message || '');
  const details = String((error as any).details || '');
  const hint = String((error as any).hint || '');
  const full = `${message} ${details} ${hint}`.toLowerCase();
  const column = columnName.toLowerCase();
  return full.includes(column) && (full.includes('does not exist') || full.includes('schema cache'));
}

async function writeCreatorSubscription(
  input: RecurringSyncInput,
  payload: Record<string, unknown>
) {
  if (!input.photographerId) {
    if (input.externalSubscriptionId) {
      await input.supabase
        .from('subscriptions')
        .update(payload)
        .eq('external_subscription_id', input.externalSubscriptionId)
        .throwOnError();
    }
    return;
  }

  const { data: rows } = await input.supabase
    .from('subscriptions')
    .select('id, plan_code, status, current_period_end, updated_at, created_at')
    .eq('photographer_id', input.photographerId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });

  const existingRows = (rows || []) as CreatorSubscriptionRow[];
  const primary = pickPrimaryCreatorSubscription(existingRows);

  if (primary?.id) {
    await input.supabase
      .from('subscriptions')
      .update(payload)
      .eq('id', primary.id)
      .throwOnError();

    const duplicateIds = existingRows.filter((row) => row.id !== primary.id).map((row) => row.id);
    if (duplicateIds.length > 0) {
      await input.supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          cancel_at_period_end: true,
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', duplicateIds)
        .throwOnError();
    }
    return;
  }

  await input.supabase
    .from('subscriptions')
    .insert(payload)
    .throwOnError();
}

export async function syncRecurringSubscriptionRecord(input: RecurringSyncInput) {
  const nowIso = new Date().toISOString();
  const status = normalizeStatus(input.scope, input.status);
  const billingCycle = normalizeBillingCycle(input.billingCycle);
  const currency = normalizeCurrency(input.currency);
  const amountCents = parseAmountCents(input.amountCents);
  const providerMetadata = {
    ...(input.metadata || {}),
    provider_event_type: input.eventType || null,
    provider_status: input.status,
  };

  const currentPeriodStart = toIso(input.currentPeriodStart) || nowIso;
  const currentPeriodEnd = toIso(input.currentPeriodEnd);
  const canceledAt = toIso(input.canceledAt);

  if (input.scope === 'attendee_subscription') {
    const planCode = input.planCode || 'free';
    const isPremium = planCode === 'premium' || planCode === 'premium_plus';
    const isPremiumPlus = planCode === 'premium_plus';

    const payload = {
      ...(input.attendeeId ? { attendee_id: input.attendeeId } : {}),
      plan_code: planCode,
      status,
      payment_provider: input.provider,
      external_subscription_id: input.externalSubscriptionId || null,
      external_customer_id: input.externalCustomerId || null,
      external_plan_id: input.externalPlanId || null,
      billing_cycle: billingCycle,
      currency,
      amount_cents: amountCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      canceled_at: canceledAt,
      last_webhook_event_at: nowIso,
      metadata: {
        ...providerMetadata,
        cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
        can_discover_non_contacts: isPremium,
        can_upload_drop_ins: isPremium,
        can_receive_all_drop_ins: isPremium,
        can_search_social_media: isPremiumPlus,
        can_search_web: isPremiumPlus,
      },
      ...(input.provider === 'stripe'
        ? {
            stripe_subscription_id: input.externalSubscriptionId || null,
            stripe_customer_id: input.externalCustomerId || null,
          }
        : {}),
    };

    if (input.attendeeId) {
      await input.supabase
        .from('attendee_subscriptions')
        .upsert(payload, { onConflict: 'attendee_id' })
        .throwOnError();
      return;
    }

    if (input.externalSubscriptionId) {
      await input.supabase
        .from('attendee_subscriptions')
        .update(payload)
        .eq('external_subscription_id', input.externalSubscriptionId)
        .throwOnError();
    }

    return;
  }

  if (input.scope === 'vault_subscription') {
    const payload = {
      ...(input.userId ? { user_id: input.userId } : {}),
      plan_id: input.planId || null,
      status,
      billing_cycle: billingCycle,
      price_paid: amountCents !== null ? amountCents / 100 : null,
      currency,
      payment_provider: input.provider,
      external_subscription_id: input.externalSubscriptionId || null,
      external_customer_id: input.externalCustomerId || null,
      external_plan_id: input.externalPlanId || null,
      amount_cents: amountCents,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancelled_at: canceledAt,
      last_webhook_event_at: nowIso,
      metadata: {
        ...providerMetadata,
        plan_slug: input.planSlug || null,
      },
    };

    if (input.userId) {
      await input.supabase
        .from('storage_subscriptions')
        .upsert(payload, { onConflict: 'user_id' })
        .throwOnError();

      await input.supabase
        .rpc('sync_subscription_limits', { p_user_id: input.userId })
        .catch(() => {});
      return;
    }

    if (input.externalSubscriptionId) {
      await input.supabase
        .from('storage_subscriptions')
        .update(payload)
        .eq('external_subscription_id', input.externalSubscriptionId)
        .throwOnError();
    }

    return;
  }

  const payload = {
    ...(input.photographerId ? { photographer_id: input.photographerId } : {}),
    plan_code: input.planCode || 'free',
    plan_id: input.planId || null,
    status,
    payment_provider: input.provider,
    external_subscription_id: input.externalSubscriptionId || null,
    external_customer_id: input.externalCustomerId || null,
    external_plan_id: input.externalPlanId || null,
    billing_cycle: billingCycle,
    currency,
    amount_cents: amountCents,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
    canceled_at: canceledAt,
    last_webhook_event_at: nowIso,
    metadata: {
      ...providerMetadata,
      plan_id: input.planId || null,
    },
    ...(input.provider === 'stripe'
      ? {
          stripe_subscription_id: input.externalSubscriptionId || null,
          stripe_customer_id: input.externalCustomerId || null,
        }
      : {}),
  };

  try {
    await writeCreatorSubscription(input, payload);
  } catch (error) {
    if (isMissingColumnError(error, 'plan_id')) {
      const fallbackPayload = { ...payload } as Record<string, unknown>;
      delete fallbackPayload.plan_id;
      const metadata = { ...(fallbackPayload.metadata as Record<string, unknown>), plan_id: input.planId || null };
      fallbackPayload.metadata = metadata;
      await writeCreatorSubscription(input, fallbackPayload);
      return;
    }
    throw error;
  }
}

export function parseMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return numberValue;
}
