import { createServiceClient } from '@/lib/supabase/server';
import { recordFinancialJournal } from '@/lib/payments/financial-ledger';

import { getAvailableDropInCredits } from './credits';
import { resolveDropInPricingConfig } from './pricing';

interface ConsumeDropInCreditsInput {
  attendeeId: string;
  action: string;
  creditsNeeded: number;
  metadata?: Record<string, unknown>;
}

interface ConsumeDropInCreditsResult {
  consumed: boolean;
  availableCredits: number;
}

function resolveDropInConsumptionIdempotencyKey(input: ConsumeDropInCreditsInput): string {
  const metadata = input.metadata || {};
  const sourceId =
    String(
      metadata.drop_in_credit_usage_id ||
        metadata.search_id ||
        metadata.notification_id ||
        metadata.drop_in_photo_id ||
        metadata.request_id ||
        ''
    ).trim() || `${Date.now()}`;

  return `ledger:dropin_credit_consumption:${input.attendeeId}:${input.action}:${sourceId}:${Math.max(
    1,
    Number(input.creditsNeeded || 1)
  )}`;
}

async function resolveDropInConsumptionValue(input: ConsumeDropInCreditsInput): Promise<{ amountMinor: number; currency: string }> {
  const metadata = input.metadata || {};
  const explicitUnit =
    Number(metadata.credit_unit_cents || metadata.creditUnitCents || metadata.unit_price_cents || 0) || 0;
  const explicitCurrency = String(metadata.currency || metadata.credit_currency || '').trim().toUpperCase();

  if (explicitUnit > 0) {
    return {
      amountMinor: Math.round(explicitUnit * Math.max(1, Number(input.creditsNeeded || 1))),
      currency: explicitCurrency || 'USD',
    };
  }

  const pricing = await resolveDropInPricingConfig();
  return {
    amountMinor: Math.round(Number(pricing.creditUnitCents || 0) * Math.max(1, Number(input.creditsNeeded || 1))),
    currency: pricing.currencyCode || 'USD',
  };
}

async function recordDropInConsumptionJournal(
  serviceClient: ReturnType<typeof createServiceClient>,
  input: ConsumeDropInCreditsInput
) {
  try {
    const value = await resolveDropInConsumptionValue(input);
    if (!Number.isFinite(value.amountMinor) || value.amountMinor <= 0) {
      return;
    }

    await recordFinancialJournal(serviceClient, {
      idempotencyKey: resolveDropInConsumptionIdempotencyKey(input),
      sourceKind: 'drop_in_credit_usage',
      sourceId:
        String(
          input.metadata?.drop_in_credit_usage_id ||
            input.metadata?.search_id ||
            input.metadata?.notification_id ||
            input.metadata?.drop_in_photo_id ||
            input.attendeeId
        ) || input.attendeeId,
      flowType: 'drop_in_credit_consumption',
      currency: value.currency,
      description: `Drop-in credit consumption (${input.action})`,
      metadata: {
        attendee_id: input.attendeeId,
        action: input.action,
        credits_needed: Math.max(1, Number(input.creditsNeeded || 1)),
        ...input.metadata,
      },
      postings: [
        {
          accountCode: 'attendee_credit_liability',
          direction: 'debit',
          amountMinor: value.amountMinor,
          currency: value.currency,
          counterpartyType: 'attendee',
          counterpartyId: input.attendeeId,
        },
        {
          accountCode: 'platform_revenue',
          direction: 'credit',
          amountMinor: value.amountMinor,
          currency: value.currency,
        },
      ],
    });
  } catch (error) {
    console.error('[LEDGER] failed to record drop-in credit consumption journal:', error);
  }
}

export async function consumeDropInCredits(
  serviceClient: ReturnType<typeof createServiceClient>,
  input: ConsumeDropInCreditsInput
): Promise<ConsumeDropInCreditsResult> {
  const creditsNeeded = Math.max(1, Number(input.creditsNeeded || 1));
  const params = {
    p_attendee_id: input.attendeeId,
    p_action: input.action,
    p_credits_needed: creditsNeeded,
    p_metadata: input.metadata || {},
  };

  const { data: rpcConsumed, error: rpcError } = await serviceClient.rpc('use_drop_in_credits', params);
  if (!rpcError && rpcConsumed) {
    const availableCredits = await getAvailableDropInCredits(serviceClient, input.attendeeId);
    await recordDropInConsumptionJournal(serviceClient, input);
    return { consumed: true, availableCredits };
  }

  // Fallback for legacy DB function behavior that fails when credits are split across multiple rows.
  const availableCredits = await getAvailableDropInCredits(serviceClient, input.attendeeId);
  if (availableCredits < creditsNeeded) {
    return { consumed: false, availableCredits };
  }

  let remaining = creditsNeeded;
  const nowIso = new Date().toISOString();
  const { data: purchases, error: purchasesError } = await serviceClient
    .from('drop_in_credit_purchases')
    .select('id, credits_remaining')
    .eq('attendee_id', input.attendeeId)
    .eq('status', 'active')
    .gt('credits_remaining', 0)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (purchasesError || !purchases) {
    return { consumed: false, availableCredits };
  }

  for (const purchase of purchases) {
    if (remaining <= 0) break;
    const currentRemaining = Math.max(0, Number((purchase as any).credits_remaining || 0));
    if (currentRemaining <= 0) continue;

    const take = Math.min(currentRemaining, remaining);
    const nextRemaining = currentRemaining - take;

    const { error: updateError } = await serviceClient
      .from('drop_in_credit_purchases')
      .update({
        credits_remaining: nextRemaining,
        status: nextRemaining <= 0 ? 'exhausted' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', (purchase as any).id)
      .eq('attendee_id', input.attendeeId)
      .gte('credits_remaining', take);

    if (updateError) {
      continue;
    }

    await serviceClient.from('drop_in_credit_usage').insert({
      attendee_id: input.attendeeId,
      purchase_id: (purchase as any).id,
      action: input.action,
      credits_used: take,
      metadata: {
        ...(input.metadata || {}),
        fallback_consume: true,
        requested_credits: creditsNeeded,
        consumed_from_purchase_id: (purchase as any).id,
      },
    });

    remaining -= take;
  }

  const reconciledAvailable = await getAvailableDropInCredits(serviceClient, input.attendeeId);
  await serviceClient
    .from('attendees')
    .update({ drop_in_credits: reconciledAvailable })
    .eq('id', input.attendeeId);

  if (remaining <= 0) {
    await recordDropInConsumptionJournal(serviceClient, input);
  }

  return {
    consumed: remaining <= 0,
    availableCredits: reconciledAvailable,
  };
}
