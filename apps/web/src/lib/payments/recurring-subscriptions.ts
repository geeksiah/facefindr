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
  // Optional capability metadata.
  // Trial-aware checkout expects these keys for non-Stripe providers:
  // - trial_supported: boolean
  // - trial_duration_days: number (optional when trial_duration_flexible=true)
  // - trial_duration_flexible: boolean (optional)
  // - trial_auto_bill_off_supported: boolean (required when plan has trial_auto_bill_enabled=false)
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

function getBillingCycleCandidates(cycle: BillingCycle): BillingCycle[] {
  if (cycle === 'annual' || cycle === 'yearly') {
    return ['annual', 'yearly'];
  }
  return ['monthly'];
}

export async function resolveProviderPlanMapping(params: {
  productScope: RecurringProductScope;
  internalPlanCode: string;
  internalPlanCodeAliases?: string[];
  provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
  billingCycle?: string;
  currency?: string;
  regionCode?: string;
  allowCurrencyFallback?: boolean;
}): Promise<ProviderPlanMapping | null> {
  const supabase = createServiceClient();
  const billingCycle = normalizeBillingCycle(params.billingCycle);
  const billingCycleCandidates = getBillingCycleCandidates(billingCycle);
  const currency = normalizeCurrency(params.currency);
  const regionCode = normalizeRegion(params.regionCode);
  const planCodeCandidates = Array.from(
    new Set(
      [params.internalPlanCode, ...(params.internalPlanCodeAliases || [])]
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0)
    )
  );
  if (!planCodeCandidates.length) {
    return null;
  }

  const candidates: Array<{ currency: string; region: string }> = [
    { currency, region: regionCode },
    { currency: 'USD', region: regionCode },
    { currency, region: 'GLOBAL' },
    { currency: 'USD', region: 'GLOBAL' },
  ];

  for (const planCode of planCodeCandidates) {
    for (const cycleCandidate of billingCycleCandidates) {
      for (const candidate of candidates) {
        const { data } = await supabase
          .from('provider_plan_mappings')
          .select('*')
          .eq('product_scope', params.productScope)
          .eq('internal_plan_code', planCode)
          .eq('provider', params.provider)
          .eq('billing_cycle', cycleCandidate)
          .eq('currency', candidate.currency)
          .eq('region_code', candidate.region)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (data) {
          return data as ProviderPlanMapping;
        }
      }
    }
  }

  if (!params.allowCurrencyFallback) {
    return null;
  }

  for (const planCode of planCodeCandidates) {
    for (const cycleCandidate of billingCycleCandidates) {
      const { data } = await supabase
        .from('provider_plan_mappings')
        .select('*')
        .eq('product_scope', params.productScope)
        .eq('internal_plan_code', planCode)
        .eq('provider', params.provider)
        .eq('billing_cycle', cycleCandidate)
        .eq('region_code', regionCode)
        .eq('is_active', true)
        .order('currency', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        return data as ProviderPlanMapping;
      }
    }
  }

  for (const planCode of planCodeCandidates) {
    for (const cycleCandidate of billingCycleCandidates) {
      const { data } = await supabase
        .from('provider_plan_mappings')
        .select('*')
        .eq('product_scope', params.productScope)
        .eq('internal_plan_code', planCode)
        .eq('provider', params.provider)
        .eq('billing_cycle', cycleCandidate)
        .eq('region_code', 'GLOBAL')
        .eq('is_active', true)
        .order('currency', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        return data as ProviderPlanMapping;
      }
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
