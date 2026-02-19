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

export type PaymentGateway = 'stripe' | 'flutterwave' | 'paypal' | 'paystack';
export type PaymentProductType =
  | 'event_checkout'
  | 'tip'
  | 'drop_in'
  | 'subscription'
  | 'attendee_subscription'
  | 'vault_subscription';
export type RuntimeEnvironment = 'development' | 'staging' | 'production';

export interface GatewaySelection {
  gateway: PaymentGateway;
  reason: string;
  availableGateways: PaymentGateway[];
  countryCode: string;
  productType: PaymentProductType;
  environment: RuntimeEnvironment;
}

function getProductSupportedGateways(productType: PaymentProductType): PaymentGateway[] {
  if (
    productType === 'subscription' ||
    productType === 'attendee_subscription' ||
    productType === 'vault_subscription'
  ) {
    return ['stripe', 'flutterwave', 'paypal', 'paystack'];
  }
  return ['stripe', 'flutterwave', 'paypal', 'paystack'];
}

export class GatewaySelectionError extends Error {
  public readonly code: string;
  public readonly failClosed: boolean;

  constructor(message: string, code: string, failClosed = true) {
    super(message);
    this.name = 'GatewaySelectionError';
    this.code = code;
    this.failClosed = failClosed;
  }
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
  const normalize = (value: unknown) => {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  };

  const resolveCountryFromTable = async (table: 'attendees' | 'photographers') => {
    const byId = await supabase
      .from(table)
      .select('country_code')
      .eq('id', userId)
      .maybeSingle();

    const fromId = normalize(byId.data?.country_code);
    if (fromId) return fromId;

    const byUserId = await supabase
      .from(table)
      .select('country_code')
      .eq('user_id', userId)
      .maybeSingle();

    const fromUserId = normalize(byUserId.data?.country_code);
    if (fromUserId) return fromUserId;

    return null;
  };

  const attendeeCountry = await resolveCountryFromTable('attendees');
  if (attendeeCountry) return attendeeCountry;

  const creatorCountry = await resolveCountryFromTable('photographers');
  if (creatorCountry) return creatorCountry;

  const { data: user } = await supabase.auth.admin.getUserById(userId);
  const metadataCountry =
    normalize((user?.user?.user_metadata as any)?.country_code) ||
    normalize((user?.user?.app_metadata as any)?.country_code);
  if (metadataCountry) return metadataCountry;

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

  if (!wallets || wallets.length === 0) return [];

  return wallets
    .map(w => String(w.provider || '').toLowerCase())
    .filter((provider): provider is PaymentGateway =>
      provider === 'stripe' || provider === 'flutterwave' || provider === 'paypal' || provider === 'paystack'
    );
}

/**
 * Select payment gateway based on user preference, country, and availability
 */
export async function selectPaymentGateway(options: {
  userId: string;
  photographerId?: string;
  currency?: string;
  countryCode?: string;
  productType?: PaymentProductType;
  environment?: RuntimeEnvironment;
}): Promise<GatewaySelection> {
  const { userId, photographerId, currency, countryCode, productType = 'event_checkout' } = options;
  void currency;
  const environment: RuntimeEnvironment = options.environment || (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const userCountry = countryCode || await getUserCountry(userId);
  if (!userCountry) {
    throw new GatewaySelectionError('No country available for gateway selection', 'missing_country');
  }

  const regionGateways = await getConfiguredGateways(userCountry);
  if (!regionGateways.length) {
    throw new GatewaySelectionError(`No enabled payment gateways configured for region ${userCountry}`, 'no_region_gateways');
  }

  let availableGateways = regionGateways;

  if (photographerId) {
    const walletGateways = await getAvailableGateways(photographerId);
    availableGateways = regionGateways.filter((gateway) => walletGateways.includes(gateway));
    if (!availableGateways.length) {
      throw new GatewaySelectionError(
        `No shared payment gateway between region ${userCountry} and photographer wallets`,
        'no_shared_gateway'
      );
    }
  }

  const configuredGateways = await filterConfiguredGateways(availableGateways, userCountry);
  if (!configuredGateways.length) {
    throw new GatewaySelectionError(
      `No configured provider credentials found for region ${userCountry}`,
      'no_provider_credentials'
    );
  }

  const productSupportedGateways = getProductSupportedGateways(productType);
  const productGateways = configuredGateways.filter((gateway) => productSupportedGateways.includes(gateway));
  if (!productGateways.length) {
    throw new GatewaySelectionError(
      `No supported payment gateways available for ${productType} in ${userCountry}`,
      'unsupported_gateway_for_product'
    );
  }

  const preferredGateway = await getUserPreferredGateway(userId);
  if (preferredGateway && productGateways.includes(preferredGateway)) {
    return {
      gateway: preferredGateway,
      reason: 'User preference',
      availableGateways: productGateways,
      countryCode: userCountry.toUpperCase(),
      productType,
      environment,
    };
  }

  return {
    gateway: productGateways[0],
    reason: `Region configuration (${userCountry})`,
    availableGateways: productGateways,
    countryCode: userCountry.toUpperCase(),
    productType,
    environment,
  };
}

/**
 * Check if a gateway is configured
 */
async function isGatewayConfigured(gateway: PaymentGateway, countryCode?: string): Promise<boolean> {
  if (countryCode && gateway === 'paystack') {
    const supabase = createServiceClient();
    const { data } = await (supabase
      .from('payment_provider_credentials') as any)
      .select('is_active, credentials')
      .eq('region_code', countryCode.toUpperCase())
      .eq('provider', gateway)
      .maybeSingle();

    if (data?.is_active && data.credentials && typeof data.credentials === 'object') {
      const creds = data.credentials as Record<string, unknown>;
      if (Object.keys(creds).length > 0) {
        return true;
      }
    }
  }

  switch (gateway) {
    case 'stripe':
      return !!process.env.STRIPE_SECRET_KEY;
    case 'flutterwave':
      return !!process.env.FLUTTERWAVE_SECRET_KEY;
    case 'paystack':
      return !!process.env.PAYSTACK_SECRET_KEY;
    case 'paypal':
      return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
    default:
      return false;
  }
}

/**
 * Get configured gateways by country from admin-managed region config.
 */
async function getConfiguredGateways(countryCode: string): Promise<PaymentGateway[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('region_config')
    .select('is_active, payment_providers')
    .eq('region_code', countryCode.toUpperCase())
    .single();

  if (!data?.is_active || !Array.isArray(data.payment_providers)) {
    return [];
  }

  return Array.from(
    new Set(
      data.payment_providers
        .map((provider: unknown) => String(provider || '').toLowerCase())
        .filter((provider) => provider === 'stripe' || provider === 'flutterwave' || provider === 'paypal' || provider === 'paystack')
    )
  ) as PaymentGateway[];
}

async function filterConfiguredGateways(gateways: PaymentGateway[], countryCode?: string): Promise<PaymentGateway[]> {
  const configured = await Promise.all(
    gateways.map(async (gateway) => ((await isGatewayConfigured(gateway, countryCode)) ? gateway : null))
  );

  return configured.filter((gateway): gateway is PaymentGateway => !!gateway);
}
