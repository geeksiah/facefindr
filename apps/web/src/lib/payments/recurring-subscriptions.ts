import { createServiceClient } from '@/lib/supabase/server';

export type RecurringProductScope =
  | 'creator_subscription'
  | 'attendee_subscription'
  | 'vault_subscription';

export type BillingCycle = 'monthly' | 'annual' | 'yearly';

export interface ProviderPlanMapping {
  id: string;
  product_scope: RecurringProductScope;
  internal_plan_code: string;
  provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
  provider_plan_id: string;
  provider_product_id: string | null;
  billing_cycle: BillingCycle;
  currency: string;
  region_code: string;
  metadata: Record<string, unknown> | null;
}

function normalizeCurrency(currency?: string) {
  return String(currency || 'USD').toUpperCase();
}

function normalizeRegion(regionCode?: string) {
  const value = String(regionCode || 'GLOBAL').toUpperCase();
  return value || 'GLOBAL';
}

function normalizeBillingCycle(cycle?: string): BillingCycle {
  if (cycle === 'yearly') return 'yearly';
  if (cycle === 'annual') return 'annual';
  return 'monthly';
}

export async function resolveProviderPlanMapping(params: {
  productScope: RecurringProductScope;
  internalPlanCode: string;
  provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
  billingCycle?: string;
  currency?: string;
  regionCode?: string;
}): Promise<ProviderPlanMapping | null> {
  const supabase = createServiceClient();
  const billingCycle = normalizeBillingCycle(params.billingCycle);
  const currency = normalizeCurrency(params.currency);
  const regionCode = normalizeRegion(params.regionCode);

  const candidates: Array<{ currency: string; region: string }> = [
    { currency, region: regionCode },
    { currency: 'USD', region: regionCode },
    { currency, region: 'GLOBAL' },
    { currency: 'USD', region: 'GLOBAL' },
  ];

  for (const candidate of candidates) {
    const { data } = await supabase
      .from('provider_plan_mappings')
      .select('*')
      .eq('product_scope', params.productScope)
      .eq('internal_plan_code', params.internalPlanCode)
      .eq('provider', params.provider)
      .eq('billing_cycle', billingCycle)
      .eq('currency', candidate.currency)
      .eq('region_code', candidate.region)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data) {
      return data as ProviderPlanMapping;
    }
  }

  return null;
}

export function mapProviderSubscriptionStatusToLocal(
  providerStatus: string | null | undefined,
  productScope: RecurringProductScope
) {
  const status = String(providerStatus || '').toLowerCase();

  if (status.includes('cancel')) {
    return productScope === 'vault_subscription' ? 'cancelled' : 'canceled';
  }
  if (status.includes('suspend') || status.includes('past_due') || status.includes('failed')) {
    return 'past_due';
  }
  if (status.includes('trial')) {
    return 'trialing';
  }
  if (
    status === 'active' ||
    status === 'completed' ||
    status === 'success' ||
    status === 'successful'
  ) {
    return 'active';
  }

  return null;
}
