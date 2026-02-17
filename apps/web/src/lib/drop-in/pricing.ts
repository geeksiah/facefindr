import { createServiceClient } from '@/lib/supabase/server';

const LEGACY_KEYS = ['drop_in_upload_fee_cents', 'drop_in_gift_fee_cents', 'drop_in_currency'] as const;

type JsonLike = Record<string, unknown> | null | undefined;

export interface DropInPricingConfig {
  uploadFeeCents: number;
  giftFeeCents: number;
  currencyCode: string;
  currencyLower: string;
  source: 'plans' | 'legacy' | 'hybrid';
}

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if ('cents' in objectValue) {
      return parseNumericValue(objectValue.cents);
    }
    if ('value' in objectValue) {
      return parseNumericValue(objectValue.value);
    }
  }

  return null;
}

function parseCurrencyValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function pickPlanCurrencyAndPrice(prices: JsonLike): { currency: string | null; amount: number | null } {
  if (!prices || typeof prices !== 'object') {
    return { currency: null, amount: null };
  }

  const priceMap = prices as Record<string, unknown>;
  const usdPrice = parseNumericValue(priceMap.USD ?? priceMap.usd);
  if (usdPrice !== null && usdPrice > 0) {
    return { currency: 'USD', amount: usdPrice };
  }

  for (const [code, value] of Object.entries(priceMap)) {
    const parsed = parseNumericValue(value);
    if (parsed !== null && parsed > 0) {
      return { currency: code.toUpperCase(), amount: parsed };
    }
  }

  return { currency: null, amount: null };
}

async function loadLegacyPricingSettings(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('setting_key, setting_value, value')
    .in('setting_key', [...LEGACY_KEYS]);

  if (error) {
    return {
      uploadFeeCents: null,
      giftFeeCents: null,
      currencyCode: null,
    };
  }

  const byKey = new Map<string, unknown>();
  for (const row of data || []) {
    byKey.set(row.setting_key, row.setting_value ?? row.value ?? null);
  }

  return {
    uploadFeeCents: parseNumericValue(byKey.get('drop_in_upload_fee_cents')),
    giftFeeCents: parseNumericValue(byKey.get('drop_in_gift_fee_cents')),
    currencyCode: parseCurrencyValue(byKey.get('drop_in_currency')),
  };
}

export async function resolveDropInPricingConfig(): Promise<DropInPricingConfig> {
  const supabase = createServiceClient();

  const planSelect = 'id, code, base_price_usd, prices, is_popular, plan_type, is_active';
  let { data: planData, error: planError } = await supabase
    .from('subscription_plans')
    .select(planSelect)
    .eq('is_active', true)
    .in('plan_type', ['drop_in', 'payg'])
    .order('is_popular', { ascending: false })
    .order('base_price_usd', { ascending: true });

  const missingPlanTypeColumn =
    planError?.code === '42703' ||
    (typeof planError?.message === 'string' && planError.message.includes('plan_type'));

  if (missingPlanTypeColumn) {
    const fallbackSelect = 'id, code, base_price_usd, prices, is_popular, is_active';
    const fallbackResult = await supabase
      .from('subscription_plans')
      .select(fallbackSelect)
      .eq('is_active', true)
      .order('is_popular', { ascending: false })
      .order('base_price_usd', { ascending: true });
    planData = fallbackResult.data as any[] | null;
    planError = fallbackResult.error;
  }

  if (planError) {
    throw new Error(`Failed to load drop-in plan pricing: ${planError.message}`);
  }

  const plans = (planData || []) as Array<{
    id: string;
    code: string;
    base_price_usd: number | null;
    prices?: Record<string, unknown> | null;
    is_popular?: boolean | null;
    plan_type?: string | null;
  }>;

  const bestPlan =
    plans.find((plan) => plan.plan_type === 'drop_in') ||
    plans.find((plan) => (plan.code || '').toLowerCase().includes('drop')) ||
    plans[0] ||
    null;

  const planUploadFee = bestPlan ? parseNumericValue(bestPlan.base_price_usd) : null;
  const planPriceFallback = bestPlan ? pickPlanCurrencyAndPrice(bestPlan.prices) : { currency: null, amount: null };

  const legacy = await loadLegacyPricingSettings(supabase);

  const uploadFeeCents = Math.round(
    (planUploadFee && planUploadFee > 0 ? planUploadFee : null) ??
      (planPriceFallback.amount && planPriceFallback.amount > 0 ? planPriceFallback.amount : null) ??
      (legacy.uploadFeeCents && legacy.uploadFeeCents > 0 ? legacy.uploadFeeCents : NaN)
  );

  if (!Number.isFinite(uploadFeeCents) || uploadFeeCents <= 0) {
    throw new Error('Drop-in pricing is not configured by admin');
  }

  const giftFeeCents = Math.round(
    (legacy.giftFeeCents !== null && legacy.giftFeeCents >= 0 ? legacy.giftFeeCents : null) ?? uploadFeeCents
  );

  const currencyCode =
    legacy.currencyCode || planPriceFallback.currency || 'USD';

  let source: DropInPricingConfig['source'] = 'plans';
  if (!bestPlan && legacy.uploadFeeCents !== null) {
    source = 'legacy';
  } else if (legacy.giftFeeCents !== null || legacy.currencyCode !== null) {
    source = 'hybrid';
  }

  return {
    uploadFeeCents,
    giftFeeCents,
    currencyCode,
    currencyLower: currencyCode.toLowerCase(),
    source,
  };
}
