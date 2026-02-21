import { convertCurrency, getPlatformBaseCurrency } from '@/lib/currency';

import type { FullPlanDetails } from './index';

export interface ResolvedPlanPrice {
  amountCents: number;
  targetCurrency: string;
  sourceCurrency: string;
  source:
    | 'plan_price_exact'
    | 'plan_price_platform_base'
    | 'plan_price_usd'
    | 'plan_base_usd';
}

function normalizeCurrency(value: unknown, fallback = 'USD') {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || fallback;
}

function normalizeAmount(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

async function convertAmount(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return amountCents;
  const converted = await convertCurrency(amountCents, fromCurrency, toCurrency);
  return Math.max(0, Math.round(Number(converted) || 0));
}

export async function resolvePlanPriceForCurrency(
  plan: FullPlanDetails,
  requestedCurrency: string,
  options?: {
    platformBaseCurrency?: string;
  }
): Promise<ResolvedPlanPrice | null> {
  const targetCurrency = normalizeCurrency(requestedCurrency);
  const explicitTargetAmount = normalizeAmount(plan.prices?.[targetCurrency]);
  if (explicitTargetAmount !== null) {
    return {
      amountCents: explicitTargetAmount,
      targetCurrency,
      sourceCurrency: targetCurrency,
      source: 'plan_price_exact',
    };
  }

  const platformBaseCurrency = normalizeCurrency(
    options?.platformBaseCurrency || (await getPlatformBaseCurrency()),
    'USD'
  );
  const platformBaseAmount = normalizeAmount(plan.prices?.[platformBaseCurrency]);
  if (platformBaseAmount !== null) {
    return {
      amountCents: await convertAmount(platformBaseAmount, platformBaseCurrency, targetCurrency),
      targetCurrency,
      sourceCurrency: platformBaseCurrency,
      source: 'plan_price_platform_base',
    };
  }

  const usdPlanAmount = normalizeAmount(plan.prices?.USD);
  if (usdPlanAmount !== null) {
    return {
      amountCents: await convertAmount(usdPlanAmount, 'USD', targetCurrency),
      targetCurrency,
      sourceCurrency: 'USD',
      source: 'plan_price_usd',
    };
  }

  const basePriceUsd = normalizeAmount(plan.basePriceUsd);
  if (basePriceUsd !== null) {
    return {
      amountCents: await convertAmount(basePriceUsd, 'USD', targetCurrency),
      targetCurrency,
      sourceCurrency: 'USD',
      source: 'plan_base_usd',
    };
  }

  return null;
}
