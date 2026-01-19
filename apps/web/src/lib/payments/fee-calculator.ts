/**
 * Centralized Fee Calculator
 * 
 * Single source of truth for all fee calculations across the platform.
 * Handles platform fees, transaction fees, provider fees, and currency conversion.
 */

import { convertCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/server';

export interface FeeCalculationResult {
  grossAmount: number; // In transaction currency
  originalAmount: number; // In event currency (before conversion)
  platformFee: number;
  transactionFee: number;
  providerFee: number;
  netAmount: number;
  currency: string;
  eventCurrency: string;
  exchangeRate: number;
  breakdown: {
    platformFeeRate: number;
    transactionFeeRate: number;
    transactionFeeFixed: number;
    providerFeeRate: number;
    providerFeeFixed: number;
    photographerPlan: string;
    regionCode: string | null;
  };
}

export interface CalculateFeesParams {
  grossAmount: number; // In event currency
  eventCurrency: string;
  transactionCurrency: string;
  photographerId: string;
  eventId: string;
  provider?: string; // 'stripe', 'flutterwave', 'paypal'
}

/**
 * Calculate all fees for a transaction
 * 
 * This is the single source of truth for fee calculations.
 * It considers:
 * - Photographer's subscription plan (for platform fee base rate)
 * - Region configuration (can override platform fee, adds transaction fees)
 * - Payment provider (affects provider fees)
 * - Currency (affects provider fees and conversion)
 */
export async function calculateFees(params: CalculateFeesParams): Promise<FeeCalculationResult> {
  const {
    grossAmount,
    eventCurrency,
    transactionCurrency,
    photographerId,
    eventId,
    provider = 'stripe',
  } = params;

  const supabase = await createClient();

  // Step 1: Convert gross amount to transaction currency if needed
  let convertedGrossAmount = grossAmount;
  let exchangeRate = 1.0;

  if (eventCurrency !== transactionCurrency) {
    exchangeRate = await convertCurrency(1, eventCurrency, transactionCurrency);
    convertedGrossAmount = Math.round(grossAmount * exchangeRate);
  }

  // Step 2: Get photographer's subscription plan
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_code')
    .eq('photographer_id', photographerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const photographerPlan = subscription?.plan_code || 'free';

  // Step 3: Get event to find region/country
  const { data: event } = await supabase
    .from('events')
    .select('country_code, photographer_id')
    .eq('id', eventId)
    .single();

  const regionCode = event?.country_code || null;

  // Step 4: Get platform fee rate (plan-based or region-overridden)
  let platformFeeRate = getPlanBasedPlatformFee(photographerPlan);

  // Step 5: Get region config if available
  let transactionFeeRate = 0;
  let transactionFeeFixed = 0;
  let regionCommissionRate = null;

  if (regionCode) {
    const { data: regionConfig } = await supabase
      .from('region_config')
      .select('platform_commission_percent, transaction_fee_percent, transaction_fee_fixed')
      .eq('region_code', regionCode.toUpperCase())
      .eq('is_active', true)
      .single();

    if (regionConfig) {
      // Region commission can override plan fee (but must be >= plan fee)
      regionCommissionRate = (regionConfig.platform_commission_percent || 0) / 100.0;
      platformFeeRate = Math.max(platformFeeRate, regionCommissionRate);

      transactionFeeRate = (regionConfig.transaction_fee_percent || 0) / 100.0;
      transactionFeeFixed = regionConfig.transaction_fee_fixed || 0;
    }
  }

  // Step 6: Calculate platform fee
  const platformFee = Math.round(convertedGrossAmount * platformFeeRate);

  // Step 7: Calculate transaction fee (region-based)
  const transactionFee = Math.round(convertedGrossAmount * transactionFeeRate) + transactionFeeFixed;

  // Step 8: Calculate provider fee (varies by provider and currency)
  const providerFeeResult = calculateProviderFee(
    convertedGrossAmount,
    transactionCurrency,
    provider
  );

  // Step 9: Calculate net amount
  const netAmount = Math.max(0, convertedGrossAmount - platformFee - transactionFee - providerFeeResult.fee);

  return {
    grossAmount: convertedGrossAmount,
    originalAmount: grossAmount,
    platformFee,
    transactionFee,
    providerFee: providerFeeResult.fee,
    netAmount,
    currency: transactionCurrency,
    eventCurrency,
    exchangeRate,
    breakdown: {
      platformFeeRate,
      transactionFeeRate,
      transactionFeeFixed,
      providerFeeRate: providerFeeResult.rate,
      providerFeeFixed: providerFeeResult.fixed,
      photographerPlan,
      regionCode,
    },
  };
}

/**
 * Get platform fee rate based on subscription plan
 */
function getPlanBasedPlatformFee(plan: string): number {
  const fees: Record<string, number> = {
    free: 0.25, // 25% (but payments disabled for free plan)
    starter: 0.20, // 20%
    pro: 0.15, // 15%
    studio: 0.10, // 10%
  };
  return fees[plan] || 0.20; // Default to 20%
}

/**
 * Calculate provider (Stripe/Flutterwave/PayPal) fees
 * Fees vary by currency and provider
 */
function calculateProviderFee(
  amount: number,
  currency: string,
  provider: string
): { fee: number; rate: number; fixed: number } {
  if (provider === 'stripe') {
    // Stripe fees vary by country and currency
    const stripeFees: Record<string, { rate: number; fixed: number }> = {
      USD: { rate: 0.029, fixed: 30 }, // 2.9% + $0.30
      EUR: { rate: 0.014, fixed: 25 }, // 1.4% + €0.25
      GBP: { rate: 0.014, fixed: 20 }, // 1.4% + £0.20
      CAD: { rate: 0.029, fixed: 30 }, // 2.9% + CA$0.30
      AUD: { rate: 0.029, fixed: 30 }, // 2.9% + A$0.30
      // African currencies (approximate - should use actual Stripe rates)
      GHS: { rate: 0.035, fixed: 150 }, // ~3.5% + ₵1.50
      NGN: { rate: 0.035, fixed: 1500 }, // ~3.5% + ₦15
      KES: { rate: 0.035, fixed: 50 }, // ~3.5% + KSh0.50
      ZAR: { rate: 0.035, fixed: 300 }, // ~3.5% + R3.00
    };

    const fees = stripeFees[currency] || stripeFees['USD'];
    return {
      fee: Math.round(amount * fees.rate) + fees.fixed,
      rate: fees.rate,
      fixed: fees.fixed,
    };
  }

  if (provider === 'flutterwave') {
    // Flutterwave fees (approximate)
    return {
      fee: Math.round(amount * 0.035) + 100, // ~3.5% + fixed
      rate: 0.035,
      fixed: 100,
    };
  }

  if (provider === 'paypal') {
    // PayPal fees vary significantly
    return {
      fee: Math.round(amount * 0.0349) + 30, // ~3.49% + $0.30
      rate: 0.0349,
      fixed: 30,
    };
  }

  // Default
  return {
    fee: Math.round(amount * 0.029) + 30,
    rate: 0.029,
    fixed: 30,
  };
}

/**
 * Calculate bulk pricing for an event
 */
export async function calculateBulkPrice(
  eventId: string,
  quantity: number
): Promise<number> {
  const supabase = await createClient();

  const { data: pricing } = await supabase
    .from('event_pricing')
    .select('pricing_type, price_per_media, bulk_tiers')
    .eq('event_id', eventId)
    .single();

  if (!pricing) return 0;

  // Free event
  if (pricing.pricing_type === 'free' || pricing.pricing_type === null) {
    return 0;
  }

  // Per-photo pricing
  if (pricing.pricing_type === 'per_photo' || !pricing.bulk_tiers) {
    return (pricing.price_per_media || 0) * quantity;
  }

  // Bulk pricing - find best tier
  if (pricing.bulk_tiers && Array.isArray(pricing.bulk_tiers)) {
    let bestPrice: number | null = null;

    for (const tier of pricing.bulk_tiers) {
      const minPhotos = tier.min_photos || 0;
      const maxPhotos = tier.max_photos || null;
      const pricePerPhoto = tier.price || 0; // In cents

      // Check if quantity falls in this tier
      if (quantity >= minPhotos && (maxPhotos === null || quantity <= maxPhotos)) {
        const tierTotalPrice = Math.round((pricePerPhoto / 100) * quantity * 100);
        
        // Keep the best (lowest) price
        if (bestPrice === null || tierTotalPrice < bestPrice) {
          bestPrice = tierTotalPrice;
        }
      }
    }

    if (bestPrice !== null) {
      return bestPrice;
    }
  }

  // Fallback to per-photo
  return (pricing.price_per_media || 0) * quantity;
}

/**
 * Validate bulk pricing tiers
 */
export function validateBulkTiers(tiers: Array<{
  min_photos: number;
  max_photos: number | null;
  price: number;
}>): { valid: boolean; error?: string } {
  if (!tiers || tiers.length === 0) {
    return { valid: false, error: 'At least one tier is required' };
  }

  // Sort by min_photos
  const sortedTiers = [...tiers].sort((a, b) => a.min_photos - b.min_photos);

  let prevMax = -1;

  for (const tier of sortedTiers) {
    const { min_photos, max_photos, price } = tier;

    // Validate min_photos
    if (min_photos < 0) {
      return { valid: false, error: `Tier with min_photos=${min_photos} must be >= 0` };
    }

    // Validate max_photos
    if (max_photos !== null && max_photos <= min_photos) {
      return { valid: false, error: `Tier max_photos (${max_photos}) must be > min_photos (${min_photos})` };
    }

    // Validate no overlap with previous tier
    if (prevMax >= 0 && min_photos <= prevMax) {
      return { valid: false, error: `Tier overlap: tier starting at ${min_photos} overlaps with previous tier ending at ${prevMax}` };
    }

    // Validate price
    if (price <= 0) {
      return { valid: false, error: `Tier price must be > 0` };
    }

    prevMax = max_photos || 999999;
  }

  return { valid: true };
}
