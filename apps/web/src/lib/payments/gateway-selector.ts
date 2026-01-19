/**
 * Payment Gateway Selector
 * 
 * Determines which payment gateway to use based on:
 * 1. User's payment method preference (from subscription_settings)
 * 2. User's country/location
 * 3. Available gateways configured for the photographer/event
 * 4. Currency requirements
 */

import { createServiceClient } from '@/lib/supabase/server';

export type PaymentGateway = 'stripe' | 'flutterwave' | 'paypal';

export interface GatewaySelection {
  gateway: PaymentGateway;
  reason: string;
  availableGateways: PaymentGateway[];
}

/**
 * Get user's preferred payment gateway from settings
 */
export async function getUserPreferredGateway(userId: string): Promise<PaymentGateway | null> {
  const supabase = createServiceClient();
  
  const { data: settings } = await supabase
    .from('subscription_settings')
    .select('preferred_payment_gateway')
    .eq('user_id', userId)
    .single();

  if (settings?.preferred_payment_gateway) {
    return settings.preferred_payment_gateway as PaymentGateway;
  }

  return null;
}

/**
 * Get user's country code
 */
export async function getUserCountry(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  
  // Try to get from attendee profile
  const { data: attendee } = await supabase
    .from('attendees')
    .select('country_code')
    .eq('id', userId)
    .single();

  if (attendee?.country_code) {
    return attendee.country_code;
  }

  // Try photographer profile
  const { data: photographer } = await supabase
    .from('photographers')
    .select('country_code')
    .eq('id', userId)
    .single();

  if (photographer?.country_code) {
    return photographer.country_code;
  }

  return null;
}

/**
 * Get available gateways for a photographer based on their wallets
 */
export async function getAvailableGateways(photographerId: string): Promise<PaymentGateway[]> {
  const supabase = createServiceClient();
  
  const { data: wallets } = await supabase
    .from('wallets')
    .select('provider, status')
    .eq('photographer_id', photographerId)
    .eq('status', 'active');

  if (!wallets || wallets.length === 0) {
    return ['stripe']; // Default to Stripe if no wallets configured
  }

  return wallets.map(w => w.provider as PaymentGateway);
}

/**
 * Select payment gateway based on user preference, country, and availability
 */
export async function selectPaymentGateway(options: {
  userId: string;
  photographerId?: string;
  currency?: string;
  countryCode?: string;
}): Promise<GatewaySelection> {
  const { userId, photographerId, currency, countryCode } = options;

  // 1. Check user's preferred gateway
  const preferredGateway = await getUserPreferredGateway(userId);
  if (preferredGateway) {
    // Verify it's available for this photographer
    if (photographerId) {
      const available = await getAvailableGateways(photographerId);
      if (available.includes(preferredGateway)) {
        return {
          gateway: preferredGateway,
          reason: 'User preference',
          availableGateways: available,
        };
      }
    } else {
      // For non-photographer payments (drop-in, subscriptions), check if gateway is configured
      const isConfigured = await isGatewayConfigured(preferredGateway);
      if (isConfigured) {
        return {
          gateway: preferredGateway,
          reason: 'User preference',
          availableGateways: [preferredGateway],
        };
      }
    }
  }

  // 2. Get user's country if not provided
  const userCountry = countryCode || await getUserCountry(userId);

  // 3. Get available gateways
  let availableGateways: PaymentGateway[] = ['stripe']; // Default
  if (photographerId) {
    availableGateways = await getAvailableGateways(photographerId);
  } else {
    // For platform payments, check which gateways are configured
    availableGateways = await getConfiguredGateways();
  }

  // 4. Select based on country preferences
  if (userCountry) {
    const countryBasedGateway = getGatewayForCountry(userCountry, availableGateways);
    if (countryBasedGateway) {
      return {
        gateway: countryBasedGateway,
        reason: `Country preference (${userCountry})`,
        availableGateways,
      };
    }
  }

  // 5. Default to first available gateway
  return {
    gateway: availableGateways[0],
    reason: 'Default selection',
    availableGateways,
  };
}

/**
 * Get recommended gateway for a country
 */
function getGatewayForCountry(
  countryCode: string,
  availableGateways: PaymentGateway[]
): PaymentGateway | null {
  // Country-based gateway preferences
  const countryPreferences: Record<string, PaymentGateway[]> = {
    // African countries - prefer Flutterwave
    GH: ['flutterwave', 'stripe', 'paypal'],
    NG: ['flutterwave', 'stripe', 'paypal'],
    KE: ['flutterwave', 'stripe', 'paypal'],
    ZA: ['stripe', 'flutterwave', 'paypal'],
    UG: ['flutterwave', 'stripe', 'paypal'],
    TZ: ['flutterwave', 'stripe', 'paypal'],
    // Other regions - prefer Stripe
    US: ['stripe', 'paypal'],
    GB: ['stripe', 'paypal'],
    CA: ['stripe', 'paypal'],
    AU: ['stripe', 'paypal'],
    // Default to Stripe
  };

  const preferences = countryPreferences[countryCode.toUpperCase()] || ['stripe', 'paypal'];
  
  // Return first preference that's available
  for (const gateway of preferences) {
    if (availableGateways.includes(gateway)) {
      return gateway;
    }
  }

  return null;
}

/**
 * Check if a gateway is configured
 */
async function isGatewayConfigured(gateway: PaymentGateway): Promise<boolean> {
  switch (gateway) {
    case 'stripe':
      return !!process.env.STRIPE_SECRET_KEY;
    case 'flutterwave':
      return !!process.env.FLUTTERWAVE_SECRET_KEY;
    case 'paypal':
      return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
    default:
      return false;
  }
}

/**
 * Get all configured gateways
 */
async function getConfiguredGateways(): Promise<PaymentGateway[]> {
  const gateways: PaymentGateway[] = [];
  
  if (await isGatewayConfigured('stripe')) {
    gateways.push('stripe');
  }
  if (await isGatewayConfigured('flutterwave')) {
    gateways.push('flutterwave');
  }
  if (await isGatewayConfigured('paypal')) {
    gateways.push('paypal');
  }

  return gateways.length > 0 ? gateways : ['stripe']; // Default to Stripe
}
