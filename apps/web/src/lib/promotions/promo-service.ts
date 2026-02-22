import { createHash } from 'crypto';

import { createServiceClient } from '@/lib/supabase/server';

export type PromoProductScope =
  | 'creator_subscription'
  | 'vault_subscription'
  | 'drop_in_credits';

type ServiceClient = ReturnType<typeof createServiceClient>;

export interface PromoValidationInput {
  supabase?: ServiceClient;
  userId: string;
  promoCode?: string | null;
  scope: PromoProductScope;
  amountCents: number;
  currency: string;
  planCode?: string | null;
  storagePlanSlug?: string | null;
}

export interface PromoValidationResult {
  applied: boolean;
  reason: string | null;
  promoCodeId: string | null;
  promoCode: string | null;
  discountCents: number;
  appliedAmountCents: number;
  finalAmountCents: number;
}

export interface PromoRedemptionCommitInput {
  supabase?: ServiceClient;
  userId: string;
  scope: PromoProductScope;
  promoCodeId: string | null;
  promoCode?: string | null;
  appliedAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
  currency: string;
  planReference?: string | null;
  sourceRef: string;
  metadata?: Record<string, unknown> | null;
}

function isMissingPromoInfrastructureError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  if (code === '42P01' || code === '42883') return true;
  if (code.startsWith('PGRST') && message.includes('schema cache')) return true;
  return false;
}

function isRecoverablePromoValidationRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  return code === '42702' && message.includes('promo_code_id') && message.includes('ambiguous');
}

function normalizePromoCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return code.length > 0 ? code : null;
}

function asMinorAmount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeOptionalCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeScope(value: unknown): PromoProductScope | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'creator_subscription') return 'creator_subscription';
  if (normalized === 'vault_subscription') return 'vault_subscription';
  if (normalized === 'drop_in_credits') return 'drop_in_credits';
  return null;
}

function normalizeDiscountType(value: unknown): 'fixed' | 'percent' | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fixed') return 'fixed';
  if (normalized === 'percent') return 'percent';
  return null;
}

function toIsoDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function codesEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function deterministicUuidFromSource(source: string): string {
  const hash = createHash('sha256').update(source).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function toPromoMetadata(
  promo: PromoValidationResult
): Record<string, string | number | null> {
  return {
    promo_code: promo.promoCode,
    promo_code_id: promo.promoCodeId,
    promo_discount_cents: promo.discountCents,
    promo_applied_amount_cents: promo.appliedAmountCents,
    promo_final_amount_cents: promo.finalAmountCents,
    promo_applied: promo.applied ? 'true' : 'false',
  };
}

async function validatePromoCodeFallback(
  supabase: ServiceClient,
  input: PromoValidationInput,
  normalizedCode: string,
  appliedAmountCents: number,
  baseResult: PromoValidationResult
): Promise<PromoValidationResult> {
  const { data: promo, error: promoError } = await supabase
    .from('promo_codes')
    .select(
      [
        'id',
        'code',
        'product_scope',
        'discount_type',
        'discount_value',
        'currency',
        'target_plan_code',
        'target_storage_plan_slug',
        'is_active',
        'starts_at',
        'expires_at',
        'max_redemptions',
        'max_redemptions_per_user',
        'times_redeemed',
      ].join(', ')
    )
    .eq('code', normalizedCode)
    .maybeSingle();

  if (promoError) {
    if (isMissingPromoInfrastructureError(promoError)) {
      return {
        ...baseResult,
        reason: 'promo_infrastructure_unavailable',
      };
    }
    throw promoError;
  }

  if (!promo?.id) {
    return {
      ...baseResult,
      reason: 'not_found',
      promoCode: normalizedCode,
    };
  }

  if (promo.is_active === false) {
    return {
      ...baseResult,
      reason: 'inactive',
      promoCode: normalizedCode,
    };
  }

  const promoScope = normalizeScope(promo.product_scope);
  if (!promoScope || promoScope !== input.scope) {
    return {
      ...baseResult,
      reason: 'scope_mismatch',
      promoCode: normalizedCode,
    };
  }

  const now = new Date();
  const startsAt = toIsoDate(promo.starts_at);
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return {
      ...baseResult,
      reason: 'not_started',
      promoCode: normalizedCode,
    };
  }

  const expiresAt = toIsoDate(promo.expires_at);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return {
      ...baseResult,
      reason: 'expired',
      promoCode: normalizedCode,
    };
  }

  const targetPlanCode = normalizeOptionalCode(promo.target_plan_code);
  if (targetPlanCode && !codesEqual(targetPlanCode, input.planCode || null)) {
    return {
      ...baseResult,
      reason: 'plan_mismatch',
      promoCode: normalizedCode,
    };
  }

  const targetStoragePlanSlug = normalizeOptionalCode(promo.target_storage_plan_slug);
  if (targetStoragePlanSlug && !codesEqual(targetStoragePlanSlug, input.storagePlanSlug || null)) {
    return {
      ...baseResult,
      reason: 'plan_mismatch',
      promoCode: normalizedCode,
    };
  }

  const promoCurrency = normalizeOptionalCode(promo.currency);
  const requestedCurrency = normalizeOptionalCode(input.currency)?.toUpperCase() || 'USD';
  if (promoCurrency && promoCurrency.toUpperCase() !== requestedCurrency) {
    return {
      ...baseResult,
      reason: 'currency_mismatch',
      promoCode: normalizedCode,
    };
  }

  const maxRedemptions = Number(promo.max_redemptions);
  const timesRedeemed = Number(promo.times_redeemed || 0);
  if (
    Number.isFinite(maxRedemptions) &&
    maxRedemptions > 0 &&
    Number.isFinite(timesRedeemed) &&
    timesRedeemed >= maxRedemptions
  ) {
    return {
      ...baseResult,
      reason: 'max_redemptions_reached',
      promoCode: normalizedCode,
    };
  }

  const maxPerUser = Number(promo.max_redemptions_per_user);
  if (Number.isFinite(maxPerUser) && maxPerUser > 0) {
    const { count, error: redemptionCountError } = await supabase
      .from('promo_code_redemptions')
      .select('id', { head: true, count: 'exact' })
      .eq('promo_code_id', promo.id)
      .eq('user_id', input.userId);

    if (redemptionCountError) {
      if (isMissingPromoInfrastructureError(redemptionCountError)) {
        return {
          ...baseResult,
          reason: 'promo_infrastructure_unavailable',
        };
      }
      throw redemptionCountError;
    }

    if (Number(count || 0) >= maxPerUser) {
      return {
        ...baseResult,
        reason: 'user_limit_reached',
        promoCode: normalizedCode,
      };
    }
  }

  const discountType = normalizeDiscountType(promo.discount_type);
  const discountValue = Number(promo.discount_value || 0);
  let discountCents = 0;
  if (discountType === 'percent') {
    const boundedPercent = Math.max(0, Math.min(100, discountValue));
    discountCents = Math.round((appliedAmountCents * boundedPercent) / 100);
  } else if (discountType === 'fixed') {
    discountCents = asMinorAmount(discountValue);
  } else {
    return {
      ...baseResult,
      reason: 'invalid_promo',
      promoCode: normalizedCode,
    };
  }

  discountCents = Math.min(discountCents, appliedAmountCents);
  if (discountCents <= 0) {
    return {
      ...baseResult,
      reason: 'invalid_promo',
      promoCode: normalizedCode,
    };
  }

  return {
    applied: true,
    reason: null,
    promoCodeId: promo.id,
    promoCode: normalizedCode,
    discountCents,
    appliedAmountCents,
    finalAmountCents: Math.max(0, appliedAmountCents - discountCents),
  };
}

export async function validatePromoCodeForCheckout(
  input: PromoValidationInput
): Promise<PromoValidationResult> {
  const normalizedCode = normalizePromoCode(input.promoCode);
  const appliedAmountCents = asMinorAmount(input.amountCents);
  const baseResult: PromoValidationResult = {
    applied: false,
    reason: null,
    promoCodeId: null,
    promoCode: null,
    discountCents: 0,
    appliedAmountCents,
    finalAmountCents: appliedAmountCents,
  };

  if (!normalizedCode) {
    return baseResult;
  }

  const supabase = input.supabase || createServiceClient();
  const { data, error } = await supabase.rpc('validate_promo_code', {
    p_code: normalizedCode,
    p_product_scope: input.scope,
    p_user_id: input.userId,
    p_plan_code: input.planCode || null,
    p_storage_plan_slug: input.storagePlanSlug || null,
    p_currency: String(input.currency || 'USD').toUpperCase(),
    p_amount_cents: appliedAmountCents,
  });

  if (error) {
    if (isMissingPromoInfrastructureError(error) || isRecoverablePromoValidationRpcError(error)) {
      return validatePromoCodeFallback(supabase, input, normalizedCode, appliedAmountCents, baseResult);
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.valid) {
    return {
      ...baseResult,
      reason: row?.reason ? String(row.reason) : 'invalid_promo',
      promoCode: normalizedCode,
    };
  }

  const promoCodeId = isUuid(row.promo_code_id) ? row.promo_code_id : null;
  const discountCents = asMinorAmount(row.discount_cents);
  const finalAmountCents = asMinorAmount(row.final_amount_cents);

  return {
    applied: Boolean(promoCodeId) && discountCents > 0,
    reason: null,
    promoCodeId,
    promoCode: normalizedCode,
    discountCents,
    appliedAmountCents,
    finalAmountCents,
  };
}

export async function commitPromoRedemption(
  input: PromoRedemptionCommitInput
): Promise<{ created: boolean; duplicate: boolean; reason?: string }> {
  if (!input.promoCodeId || !isUuid(input.promoCodeId)) {
    return { created: false, duplicate: false, reason: 'missing_promo_code_id' };
  }
  if (!input.sourceRef) {
    return { created: false, duplicate: false, reason: 'missing_source_ref' };
  }

  const appliedAmountCents = asMinorAmount(input.appliedAmountCents);
  const discountCents = asMinorAmount(input.discountCents);
  const finalAmountCents = asMinorAmount(input.finalAmountCents);
  if (discountCents <= 0) {
    return { created: false, duplicate: false, reason: 'zero_discount' };
  }

  const supabase = input.supabase || createServiceClient();
  const deterministicTransactionId = deterministicUuidFromSource(
    `${input.scope}:${input.userId}:${input.sourceRef}`
  );

  const metadata = {
    ...(input.metadata || {}),
    source_ref: input.sourceRef,
    promo_code: input.promoCode || null,
  };

  const { data, error } = await supabase
    .from('promo_code_redemptions')
    .insert({
      promo_code_id: input.promoCodeId,
      user_id: input.userId,
      product_scope: input.scope,
      plan_reference: input.planReference || null,
      transaction_id: deterministicTransactionId,
      applied_amount_cents: appliedAmountCents,
      discount_amount_cents: discountCents,
      final_amount_cents: finalAmountCents,
      currency: String(input.currency || 'USD').toUpperCase(),
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { created: false, duplicate: true };
    }
    if (isMissingPromoInfrastructureError(error)) {
      return {
        created: false,
        duplicate: false,
        reason: 'promo_infrastructure_unavailable',
      };
    }
    throw error;
  }

  await supabase.rpc('increment_promo_code_redemption_count', {
    p_promo_code_id: input.promoCodeId,
  }).catch(async () => {
    const { data: current } = await supabase
      .from('promo_codes')
      .select('times_redeemed')
      .eq('id', input.promoCodeId)
      .maybeSingle();
    const nextCount = asMinorAmount(current?.times_redeemed) + 1;
    await supabase
      .from('promo_codes')
      .update({ times_redeemed: nextCount })
      .eq('id', input.promoCodeId);
  });

  return { created: Boolean(data?.id), duplicate: false };
}
