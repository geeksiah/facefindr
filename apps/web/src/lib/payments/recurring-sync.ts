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
      cancel_at_period_end: Boolean(input.cancelAtPeriodEnd),
      canceled_at: canceledAt,
      can_discover_non_contacts: isPremium,
      can_upload_drop_ins: isPremium,
      can_receive_all_drop_ins: isPremium,
      can_search_social_media: isPremiumPlus,
      can_search_web: isPremiumPlus,
      last_webhook_event_at: nowIso,
      metadata: providerMetadata,
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
    metadata: providerMetadata,
  };

  if (input.photographerId) {
    await input.supabase
      .from('subscriptions')
      .upsert(payload, { onConflict: 'photographer_id' })
      .throwOnError();
    return;
  }

  if (input.externalSubscriptionId) {
    await input.supabase
      .from('subscriptions')
      .update(payload)
      .eq('external_subscription_id', input.externalSubscriptionId)
      .throwOnError();
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
