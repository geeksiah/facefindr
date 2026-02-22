import { supabaseAdmin } from '@/lib/supabase';

export const DEFAULT_BASE_CURRENCY = 'USD';

function parseCurrencySetting(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  if (value && typeof value === 'object') {
    const payload = value as Record<string, unknown>;
    const candidates = [payload.code, payload.currency, payload.value];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().toUpperCase();
      }
    }
  }
  return null;
}

export async function resolvePlatformBaseCurrency(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('platform_settings')
    .select('setting_key, value')
    .in('setting_key', ['platform_base_currency', 'base_currency', 'default_currency']);

  const byKey = new Map<string, unknown>();
  for (const row of data || []) {
    byKey.set(String((row as any).setting_key || ''), (row as any).value);
  }

  const resolved =
    parseCurrencySetting(byKey.get('platform_base_currency')) ||
    parseCurrencySetting(byKey.get('base_currency')) ||
    parseCurrencySetting(byKey.get('default_currency'));

  return resolved || DEFAULT_BASE_CURRENCY;
}

export async function loadUsdRates(codes: string[]) {
  const uniqueCodes = Array.from(
    new Set(
      (codes || [])
        .map((code) => String(code || '').toUpperCase())
        .filter(Boolean)
    )
  );

  const { data } = await supabaseAdmin
    .from('exchange_rates')
    .select('to_currency, rate, valid_from')
    .eq('from_currency', 'USD')
    .in('to_currency', uniqueCodes.length > 0 ? uniqueCodes : [DEFAULT_BASE_CURRENCY])
    .or('valid_until.is.null,valid_until.gt.now()')
    .order('valid_from', { ascending: false });

  const ratesToUsdBase = new Map<string, number>();
  for (const row of data || []) {
    const code = String((row as any).to_currency || '').toUpperCase();
    if (!code || ratesToUsdBase.has(code)) continue;
    const rate = Number((row as any).rate);
    if (Number.isFinite(rate) && rate > 0) {
      ratesToUsdBase.set(code, rate);
    }
  }

  ratesToUsdBase.set('USD', 1);
  return ratesToUsdBase;
}

export function convertToBaseAmount(
  amountCents: number,
  fromCurrency: string,
  baseCurrency: string,
  usdRates: Map<string, number>
): number {
  const from = String(fromCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();
  const base = String(baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();

  if (from === base) return Math.round(Number(amountCents || 0));

  const usdToFrom = usdRates.get(from);
  const usdToBase = usdRates.get(base) || 1;
  if (!usdToFrom || usdToFrom <= 0) {
    return Math.round(Number(amountCents || 0));
  }

  const amountInUsd = Number(amountCents || 0) / usdToFrom;
  if (base === 'USD') {
    return Math.round(amountInUsd);
  }

  return Math.round(amountInUsd * usdToBase);
}

