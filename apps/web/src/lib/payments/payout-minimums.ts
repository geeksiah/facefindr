/**
 * Payout Minimums
 * 
 * Two-tier minimum system:
 * 1. PROVIDER MINIMUM: Hard floor set by payment provider (can't go below)
 * 2. PLATFORM MINIMUM: Our recommended threshold for efficiency
 * 
 * USP: "Get paid as low as $1" (provider minimum)
 * vs competitors who might require $50+ minimum
 */

// ============================================
// PROVIDER MINIMUMS (Hard floor)
// These are set by the payment providers themselves
// ============================================

export interface ProviderMinimum {
  provider: string;
  method: string;
  currency: string;
  minimumCents: number;
  displayAmount: string;
}

export const PROVIDER_MINIMUMS: ProviderMinimum[] = [
  // Stripe (Global)
  { provider: 'stripe', method: 'bank', currency: 'USD', minimumCents: 100, displayAmount: '$1.00' },
  { provider: 'stripe', method: 'bank', currency: 'GBP', minimumCents: 100, displayAmount: '£1.00' },
  { provider: 'stripe', method: 'bank', currency: 'EUR', minimumCents: 100, displayAmount: '€1.00' },
  { provider: 'stripe', method: 'bank', currency: 'CAD', minimumCents: 100, displayAmount: 'CA$1.00' },
  { provider: 'stripe', method: 'bank', currency: 'AUD', minimumCents: 100, displayAmount: 'A$1.00' },
  
  // Flutterwave Mobile Money (Very low minimums - our USP!)
  { provider: 'momo', method: 'MTN', currency: 'GHS', minimumCents: 100, displayAmount: 'GHS 1.00' },
  { provider: 'momo', method: 'VODAFONE', currency: 'GHS', minimumCents: 100, displayAmount: 'GHS 1.00' },
  { provider: 'momo', method: 'AIRTEL', currency: 'GHS', minimumCents: 100, displayAmount: 'GHS 1.00' },
  { provider: 'momo', method: 'MTN', currency: 'NGN', minimumCents: 10000, displayAmount: '₦100' },
  { provider: 'momo', method: 'MTN', currency: 'KES', minimumCents: 10000, displayAmount: 'KES 100' },
  { provider: 'momo', method: 'MTN', currency: 'UGX', minimumCents: 500000, displayAmount: 'UGX 5,000' },
  
  // Flutterwave Bank Transfer
  { provider: 'flutterwave', method: 'bank', currency: 'GHS', minimumCents: 1000, displayAmount: 'GHS 10.00' },
  { provider: 'flutterwave', method: 'bank', currency: 'NGN', minimumCents: 100000, displayAmount: '₦1,000' },
  { provider: 'flutterwave', method: 'bank', currency: 'KES', minimumCents: 100000, displayAmount: 'KES 1,000' },
  
  // PayPal
  { provider: 'paypal', method: 'paypal', currency: 'USD', minimumCents: 100, displayAmount: '$1.00' },
  { provider: 'paypal', method: 'paypal', currency: 'GBP', minimumCents: 100, displayAmount: '£1.00' },
  { provider: 'paypal', method: 'paypal', currency: 'EUR', minimumCents: 100, displayAmount: '€1.00' },
];

// ============================================
// PLATFORM MINIMUMS (Soft threshold)
// Recommended for efficiency, but scheduled payouts can go lower
// ============================================

export const PLATFORM_MINIMUMS: Record<string, number> = {
  USD: 5000,      // $50.00
  GHS: 10000,     // GHS 100.00
  NGN: 500000,    // NGN 5,000.00
  KES: 100000,    // KES 1,000.00
  GBP: 4000,      // £40.00
  EUR: 4500,      // €45.00
  ZAR: 50000,     // R500.00
  UGX: 10000000,  // UGX 100,000
};

// ============================================
// GET MINIMUMS
// ============================================

export function getProviderMinimum(
  provider: string,
  method: string,
  currency: string
): number {
  const match = PROVIDER_MINIMUMS.find(
    (m) =>
      m.provider === provider &&
      m.method === method &&
      m.currency === currency
  );
  
  // Default to $1 equivalent if not found
  if (!match) {
    return getDefaultProviderMinimum(currency);
  }
  
  return match.minimumCents;
}

export function getProviderMinimumDisplay(
  provider: string,
  method: string,
  currency: string
): string {
  const match = PROVIDER_MINIMUMS.find(
    (m) =>
      m.provider === provider &&
      m.method === method &&
      m.currency === currency
  );
  
  if (!match) {
    return formatCurrency(getDefaultProviderMinimum(currency), currency);
  }
  
  return match.displayAmount;
}

export function getPlatformMinimum(currency: string): number {
  return PLATFORM_MINIMUMS[currency] || PLATFORM_MINIMUMS['USD'];
}

export function getPlatformMinimumDisplay(currency: string): string {
  const amount = getPlatformMinimum(currency);
  return formatCurrency(amount, currency);
}

// Default provider minimum (~$1 equivalent)
function getDefaultProviderMinimum(currency: string): number {
  const defaults: Record<string, number> = {
    USD: 100,
    GHS: 1000,
    NGN: 50000,
    KES: 10000,
    GBP: 100,
    EUR: 100,
    ZAR: 1500,
    UGX: 400000,
  };
  return defaults[currency] || 100;
}

function formatCurrency(cents: number, currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    GHS: 'GHS ',
    NGN: '₦',
    KES: 'KES ',
    GBP: '£',
    EUR: '€',
    ZAR: 'R',
    UGX: 'UGX ',
  };
  
  const symbol = symbols[currency] || currency + ' ';
  const amount = (cents / 100).toFixed(2);
  
  return `${symbol}${amount}`;
}

// ============================================
// PAYOUT ELIGIBILITY CHECK
// ============================================

export interface PayoutEligibility {
  canPayout: boolean;
  balance: number;
  currency: string;
  providerMinimum: number;
  platformMinimum: number;
  providerMinimumDisplay: string;
  platformMinimumDisplay: string;
  reason?: string;
  isScheduled: boolean;
}

export function checkPayoutEligibility(
  balance: number,
  currency: string,
  provider: string,
  method: string,
  isScheduledPayout: boolean
): PayoutEligibility {
  const providerMin = getProviderMinimum(provider, method, currency);
  const platformMin = getPlatformMinimum(currency);
  
  const eligibility: PayoutEligibility = {
    canPayout: false,
    balance,
    currency,
    providerMinimum: providerMin,
    platformMinimum: platformMin,
    providerMinimumDisplay: getProviderMinimumDisplay(provider, method, currency),
    platformMinimumDisplay: getPlatformMinimumDisplay(currency),
    isScheduled: isScheduledPayout,
  };
  
  // Check provider minimum first (hard floor)
  if (balance < providerMin) {
    eligibility.reason = `Balance below provider minimum (${eligibility.providerMinimumDisplay})`;
    return eligibility;
  }
  
  // For scheduled payouts, provider minimum is all we need
  if (isScheduledPayout) {
    eligibility.canPayout = true;
    return eligibility;
  }
  
  // For threshold payouts, check platform minimum
  if (balance < platformMin) {
    eligibility.reason = `Balance below threshold (${eligibility.platformMinimumDisplay}). Choose a payout schedule to receive smaller amounts.`;
    return eligibility;
  }
  
  eligibility.canPayout = true;
  return eligibility;
}

// ============================================
// USP MESSAGING
// ============================================

export const USP_MESSAGES = {
  headline: 'Get Paid From Just $1',
  subheadline: 'Industry-leading low minimum payouts',
  
  momo: {
    headline: 'Get Paid to Mobile Money',
    subheadline: 'Receive payments directly to MTN, Vodafone, or AirtelTigo',
    minimumNote: 'Minimum payout: Just GHS 1.00',
  },
  
  comparison: {
    competitors: 'Other platforms: $50-$100 minimum',
    us: 'Ferchr: As low as $1 with daily payouts',
  },
  
  scheduledBenefit: 'Choose daily or weekly payouts to access funds faster, even small amounts',
};
