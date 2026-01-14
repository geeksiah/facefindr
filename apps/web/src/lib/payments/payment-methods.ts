/**
 * Payment Methods Service
 * 
 * Manages user payment methods for subscriptions and purchases.
 */

import { createServiceClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

// ============================================
// TYPES
// ============================================

export type PaymentMethodType = 'card' | 'mobile_money' | 'paypal' | 'bank_account';
export type PaymentMethodStatus = 'pending_verification' | 'verified' | 'failed' | 'expired';

export interface PaymentMethod {
  id: string;
  userId: string;
  methodType: PaymentMethodType;
  displayName: string;
  
  // Card
  cardBrand?: string;
  cardLastFour?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  
  // Mobile Money
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  mobileMoneyName?: string;
  mobileMoneyVerified?: boolean;
  
  // PayPal
  paypalEmail?: string;
  
  status: PaymentMethodStatus;
  isDefault: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface AddCardParams {
  stripePaymentMethodId: string;
  setAsDefault?: boolean;
}

export interface AddMobileMoneyParams {
  providerCode: string;
  phoneNumber: string;
  setAsDefault?: boolean;
}

export interface AddPayPalParams {
  email: string;
  payerId?: string;
  setAsDefault?: boolean;
}

export interface MobileMoneyProvider {
  providerCode: string;
  providerName: string;
  countryCode: string;
  supportsNameVerification: boolean;
  numberPrefix: string[];
  numberLength: number;
}

// ============================================
// STRIPE CLIENT
// ============================================

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('Stripe secret key not configured');
    }
    stripeClient = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  }
  return stripeClient;
}

// ============================================
// GET PAYMENT METHODS
// ============================================

export async function getUserPaymentMethods(userId: string): Promise<PaymentMethod[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(mapDbToPaymentMethod);
}

export async function getPaymentMethod(userId: string, methodId: string): Promise<PaymentMethod | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('id', methodId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDbToPaymentMethod(data);
}

export async function getDefaultPaymentMethod(userId: string): Promise<PaymentMethod | null> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('get_default_payment_method', {
    p_user_id: userId,
  });

  if (!data) {
    return null;
  }

  return getPaymentMethod(userId, data);
}

// ============================================
// ADD CARD (via Stripe)
// ============================================

export async function addCard(userId: string, params: AddCardParams): Promise<PaymentMethod | null> {
  const supabase = createServiceClient();
  const stripe = getStripe();

  try {
    // Get payment method details from Stripe
    const stripeMethod = await stripe.paymentMethods.retrieve(params.stripePaymentMethodId);

    if (stripeMethod.type !== 'card' || !stripeMethod.card) {
      throw new Error('Invalid card payment method');
    }

    const card = stripeMethod.card;
    const displayName = `${card.brand?.toUpperCase()} ending in ${card.last4}`;

    // Check if already exists
    const { data: existing } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .eq('stripe_payment_method_id', params.stripePaymentMethodId)
      .single();

    if (existing) {
      return getPaymentMethod(userId, existing.id);
    }

    // If setting as default, clear other defaults first
    if (params.setAsDefault) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    // Insert new payment method
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        method_type: 'card',
        display_name: displayName,
        stripe_payment_method_id: params.stripePaymentMethodId,
        card_brand: card.brand,
        card_last_four: card.last4,
        card_exp_month: card.exp_month,
        card_exp_year: card.exp_year,
        status: 'verified',
        is_default: params.setAsDefault ?? false,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to save card');
    }

    return mapDbToPaymentMethod(data);
  } catch (error) {
    console.error('Add card error:', error);
    return null;
  }
}

// ============================================
// ADD MOBILE MONEY
// ============================================

export async function addMobileMoney(
  userId: string,
  params: AddMobileMoneyParams
): Promise<{ success: boolean; paymentMethod?: PaymentMethod; error?: string; requiresVerification?: boolean }> {
  const supabase = createServiceClient();

  try {
    // Get provider info
    const { data: provider } = await supabase
      .from('mobile_money_providers')
      .select('*')
      .eq('provider_code', params.providerCode)
      .eq('is_active', true)
      .single();

    if (!provider) {
      return { success: false, error: 'Invalid mobile money provider' };
    }

    // Validate phone number format
    const cleanNumber = params.phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length !== provider.number_length) {
      return { success: false, error: `Phone number must be ${provider.number_length} digits` };
    }

    // Check prefix
    const prefixes = provider.number_prefix.split(',');
    const hasValidPrefix = prefixes.some((prefix: string) => cleanNumber.startsWith(prefix));
    if (prefixes.length > 0 && prefixes[0] !== '' && !hasValidPrefix) {
      return { success: false, error: 'Invalid phone number for this provider' };
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .eq('mobile_money_provider', params.providerCode)
      .eq('mobile_money_number', cleanNumber)
      .single();

    if (existing) {
      const pm = await getPaymentMethod(userId, existing.id);
      return { success: true, paymentMethod: pm || undefined };
    }

    // Verify with provider if supported
    let accountName: string | undefined;
    let verified = false;

    if (provider.supports_name_verification) {
      const verifyResult = await verifyMobileMoneyAccount(cleanNumber, params.providerCode);
      if (verifyResult.success) {
        accountName = verifyResult.accountName;
        verified = true;
      }
    }

    // Mask number for display
    const maskedNumber = cleanNumber.slice(0, 3) + '***' + cleanNumber.slice(-3);
    const displayName = `${provider.provider_name} ${maskedNumber}`;

    // If setting as default, clear other defaults first
    if (params.setAsDefault) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    // Insert payment method
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        method_type: 'mobile_money',
        display_name: displayName,
        mobile_money_provider: params.providerCode,
        mobile_money_number: cleanNumber,
        mobile_money_name: accountName,
        mobile_money_verified: verified,
        status: verified ? 'verified' : 'pending_verification',
        is_default: params.setAsDefault ?? false,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to save mobile money');
    }

    return {
      success: true,
      paymentMethod: mapDbToPaymentMethod(data),
      requiresVerification: !verified,
    };
  } catch (error) {
    console.error('Add mobile money error:', error);
    return { success: false, error: 'Failed to add mobile money' };
  }
}

// ============================================
// VERIFY MOBILE MONEY ACCOUNT
// ============================================

async function verifyMobileMoneyAccount(
  phoneNumber: string,
  providerCode: string
): Promise<{ success: boolean; accountName?: string }> {
  // Use Paystack's resolve account API
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  
  if (!paystackSecretKey) {
    console.warn('Paystack not configured for mobile money verification');
    return { success: false };
  }

  try {
    // Map provider to Paystack bank code
    const bankCodes: Record<string, string> = {
      'mtn_momo_gh': 'MTN',
      'vodafone_cash_gh': 'VOD',
      'airteltigo_money_gh': 'ATL',
      'mtn_momo_ng': 'MTN',
    };

    const bankCode = bankCodes[providerCode];
    if (!bankCode) {
      return { success: false };
    }

    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${phoneNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
        },
      }
    );

    const data = await response.json();

    if (data.status && data.data?.account_name) {
      return {
        success: true,
        accountName: data.data.account_name,
      };
    }

    return { success: false };
  } catch (error) {
    console.error('Mobile money verification error:', error);
    return { success: false };
  }
}

// ============================================
// ADD PAYPAL
// ============================================

export async function addPayPal(userId: string, params: AddPayPalParams): Promise<PaymentMethod | null> {
  const supabase = createServiceClient();

  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .eq('paypal_email', params.email)
      .single();

    if (existing) {
      return getPaymentMethod(userId, existing.id);
    }

    // Mask email for display
    const emailParts = params.email.split('@');
    const maskedEmail = emailParts[0].slice(0, 2) + '***@' + emailParts[1];
    const displayName = `PayPal (${maskedEmail})`;

    // If setting as default, clear other defaults first
    if (params.setAsDefault) {
      await supabase
        .from('payment_methods')
        .update({ is_default: false })
        .eq('user_id', userId);
    }

    const { data, error } = await supabase
      .from('payment_methods')
      .insert({
        user_id: userId,
        method_type: 'paypal',
        display_name: displayName,
        paypal_email: params.email,
        paypal_payer_id: params.payerId,
        status: 'verified',
        is_default: params.setAsDefault ?? false,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to save PayPal');
    }

    return mapDbToPaymentMethod(data);
  } catch (error) {
    console.error('Add PayPal error:', error);
    return null;
  }
}

// ============================================
// UPDATE / DELETE PAYMENT METHODS
// ============================================

export async function setDefaultPaymentMethod(userId: string, methodId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase.rpc('set_default_payment_method', {
    p_user_id: userId,
    p_payment_method_id: methodId,
  });

  return !!data;
}

export async function deletePaymentMethod(userId: string, methodId: string): Promise<boolean> {
  const supabase = createServiceClient();

  // Get method to check if it's a Stripe method
  const { data: method } = await supabase
    .from('payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', methodId)
    .eq('user_id', userId)
    .single();

  if (!method) {
    return false;
  }

  // Detach from Stripe if applicable
  if (method.stripe_payment_method_id) {
    try {
      const stripe = getStripe();
      await stripe.paymentMethods.detach(method.stripe_payment_method_id);
    } catch (error) {
      console.error('Failed to detach from Stripe:', error);
    }
  }

  // Delete from database
  const { error } = await supabase
    .from('payment_methods')
    .delete()
    .eq('id', methodId)
    .eq('user_id', userId);

  return !error;
}

// ============================================
// SUBSCRIPTION SETTINGS
// ============================================

export interface SubscriptionSettings {
  autoRenew: boolean;
  defaultPaymentMethodId?: string;
  renewalReminderDays: number;
  preferredCurrency: string;
}

export async function getSubscriptionSettings(userId: string): Promise<SubscriptionSettings> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('subscription_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) {
    return {
      autoRenew: true,
      renewalReminderDays: 7,
      preferredCurrency: 'USD',
    };
  }

  return {
    autoRenew: data.auto_renew,
    defaultPaymentMethodId: data.default_payment_method_id,
    renewalReminderDays: data.renewal_reminder_days,
    preferredCurrency: data.preferred_currency,
  };
}

export async function updateSubscriptionSettings(
  userId: string,
  settings: Partial<SubscriptionSettings>
): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('subscription_settings')
    .upsert({
      user_id: userId,
      auto_renew: settings.autoRenew,
      default_payment_method_id: settings.defaultPaymentMethodId,
      renewal_reminder_days: settings.renewalReminderDays,
      preferred_currency: settings.preferredCurrency,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  return !error;
}

// ============================================
// GET MOBILE MONEY PROVIDERS
// ============================================

export async function getMobileMoneyProviders(countryCode: string): Promise<MobileMoneyProvider[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('mobile_money_providers')
    .select('*')
    .eq('country_code', countryCode)
    .eq('is_active', true);

  if (!data) return [];

  return data.map(p => ({
    providerCode: p.provider_code,
    providerName: p.provider_name,
    countryCode: p.country_code,
    supportsNameVerification: p.supports_name_verification,
    numberPrefix: p.number_prefix ? p.number_prefix.split(',') : [],
    numberLength: p.number_length,
  }));
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapDbToPaymentMethod(data: Record<string, unknown>): PaymentMethod {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    methodType: data.method_type as PaymentMethodType,
    displayName: data.display_name as string || 'Payment Method',
    
    cardBrand: data.card_brand as string | undefined,
    cardLastFour: data.card_last_four as string | undefined,
    cardExpMonth: data.card_exp_month as number | undefined,
    cardExpYear: data.card_exp_year as number | undefined,
    
    mobileMoneyProvider: data.mobile_money_provider as string | undefined,
    mobileMoneyNumber: data.mobile_money_number as string | undefined,
    mobileMoneyName: data.mobile_money_name as string | undefined,
    mobileMoneyVerified: data.mobile_money_verified as boolean | undefined,
    
    paypalEmail: data.paypal_email as string | undefined,
    
    status: data.status as PaymentMethodStatus,
    isDefault: data.is_default as boolean,
    createdAt: new Date(data.created_at as string),
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at as string) : undefined,
  };
}
