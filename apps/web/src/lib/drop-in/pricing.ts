import { createServiceClient } from '@/lib/supabase/server';

const LEGACY_KEYS = ['drop_in_upload_fee_cents', 'drop_in_gift_fee_cents', 'drop_in_currency'] as const;
const CREDIT_KEYS = ['drop_in_credit_unit_price_cents', 'drop_in_credit_currency'] as const;

export interface DropInPricingConfig {
  creditUnitCents: number;
  uploadFeeCents: number;
  giftFeeCents: number;
  currencyCode: string;
  currencyLower: string;
  source: 'credits' | 'legacy';
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

async function loadLegacyPricingSettings(supabase: ReturnType<typeof createServiceClient>) {
  const keys = [...LEGACY_KEYS, ...CREDIT_KEYS];
  const { data, error } = await supabase
    .from('platform_settings')
    .select('setting_key, setting_value, value')
    .in('setting_key', keys);

  if (error) {
    return {
      creditUnitCents: null,
      creditCurrencyCode: null,
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
    creditUnitCents: parseNumericValue(byKey.get('drop_in_credit_unit_price_cents')),
    creditCurrencyCode: parseCurrencyValue(byKey.get('drop_in_credit_currency')),
    uploadFeeCents: parseNumericValue(byKey.get('drop_in_upload_fee_cents')),
    giftFeeCents: parseNumericValue(byKey.get('drop_in_gift_fee_cents')),
    currencyCode: parseCurrencyValue(byKey.get('drop_in_currency')),
  };
}

export async function resolveDropInPricingConfig(): Promise<DropInPricingConfig> {
  const supabase = createServiceClient();

  const legacy = await loadLegacyPricingSettings(supabase);

  const creditUnitCents = Math.round(
    (legacy.creditUnitCents && legacy.creditUnitCents > 0 ? legacy.creditUnitCents : null) ??
      (legacy.uploadFeeCents && legacy.uploadFeeCents > 0 ? legacy.uploadFeeCents : NaN)
  );

  if (!Number.isFinite(creditUnitCents) || creditUnitCents <= 0) {
    throw new Error('Drop-in pricing is not configured by admin');
  }

  const uploadFeeCents = creditUnitCents;
  const giftFeeCents = Math.round(
    (legacy.giftFeeCents !== null && legacy.giftFeeCents >= 0 ? legacy.giftFeeCents : null) ?? creditUnitCents
  );

  const currencyCode = legacy.creditCurrencyCode || legacy.currencyCode || 'USD';
  const source: DropInPricingConfig['source'] =
    legacy.creditUnitCents && legacy.creditUnitCents > 0 ? 'credits' : 'legacy';

  return {
    creditUnitCents,
    uploadFeeCents,
    giftFeeCents,
    currencyCode,
    currencyLower: currencyCode.toLowerCase(),
    source,
  };
}
