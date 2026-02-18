/**
 * Payment Provider Integration
 * 
 * Supports:
 * - Stripe Connect (Global, Card payments)
 * - Flutterwave (Africa, Mobile Money, Cards)
 * - Paystack (Africa and global card/bank rails)
 * - PayPal (Global, PayPal balance & Cards)
 */

export * as stripePayments from './stripe';
export * as flutterwavePayments from './flutterwave';
export * as paystackPayments from './paystack';
export * as paypalPayments from './paypal';
export * from './payout-minimums';
export * from './payout-service';
export * from './payment-methods';

export type PaymentProvider = 'stripe' | 'flutterwave' | 'paypal' | 'paystack';

export interface PaymentProviderConfig {
  provider: PaymentProvider;
  isConfigured: boolean;
  supportedCountries: string[];
  supportedMethods: string[];
  fees: {
    percentage: number;
    fixed: number;
    currency: string;
  };
}

// Platform fee (15%)
export const PLATFORM_FEE_PERCENT = 0.15;

// Check which providers are available
export function getAvailableProviders(): PaymentProviderConfig[] {
  const providers: PaymentProviderConfig[] = [];

  // Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    providers.push({
      provider: 'stripe',
      isConfigured: true,
      supportedCountries: ['US', 'GB', 'CA', 'AU', 'EU'], // Major markets
      supportedMethods: ['card'],
      fees: { percentage: 2.9, fixed: 30, currency: 'USD' },
    });
  }

  // Flutterwave
  if (process.env.FLUTTERWAVE_SECRET_KEY) {
    providers.push({
      provider: 'flutterwave',
      isConfigured: true,
      supportedCountries: ['GH', 'NG', 'KE', 'UG', 'RW', 'ZA', 'TZ'], // Africa
      supportedMethods: ['card', 'momo', 'bank'],
      fees: { percentage: 3.5, fixed: 0, currency: 'GHS' },
    });
  }

  // PayPal
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    providers.push({
      provider: 'paypal',
      isConfigured: true,
      supportedCountries: ['US', 'GB', 'CA', 'AU', 'DE', 'FR'], // PayPal markets
      supportedMethods: ['paypal', 'card'],
      fees: { percentage: 2.9, fixed: 30, currency: 'USD' },
    });
  }

  // Paystack
  if (process.env.PAYSTACK_SECRET_KEY) {
    providers.push({
      provider: 'paystack',
      isConfigured: true,
      supportedCountries: ['GH', 'NG', 'KE', 'ZA', 'UG', 'US', 'GB'],
      supportedMethods: ['card', 'bank_transfer'],
      fees: { percentage: 1.5, fixed: 100, currency: 'NGN' },
    });
  }

  return providers;
}

// Get best provider for a country
export function getProviderForCountry(countryCode: string): PaymentProvider | null {
  const providers = getAvailableProviders();

  // Africa → Flutterwave
  const africanCountries = ['GH', 'NG', 'KE', 'UG', 'RW', 'ZA', 'TZ', 'CI', 'SN', 'CM'];
  if (africanCountries.includes(countryCode)) {
    const paystack = providers.find((p) => p.provider === 'paystack');
    if (paystack) return 'paystack';

    const flutterwave = providers.find((p) => p.provider === 'flutterwave');
    if (flutterwave) return 'flutterwave';
  }

  // Default to Stripe if available
  const stripe = providers.find((p) => p.provider === 'stripe');
  if (stripe) return 'stripe';

  // Fall back to PayPal
  const paypal = providers.find((p) => p.provider === 'paypal');
  if (paypal) return 'paypal';

  return null;
}

// Currency mapping
export const COUNTRY_CURRENCIES: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  DE: 'EUR',
  FR: 'EUR',
  GH: 'GHS',
  NG: 'NGN',
  KE: 'KES',
  UG: 'UGX',
  RW: 'RWF',
  ZA: 'ZAR',
  TZ: 'TZS',
};

export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCIES[countryCode] || 'USD';
}
