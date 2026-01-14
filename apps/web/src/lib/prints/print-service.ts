/**
 * Print Products Service
 * 
 * Handles region-aware pricing for print products.
 * Different countries have different:
 * - Fulfillment partners
 * - Production costs
 * - Currencies
 * - Shipping times
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface PrintRegion {
  id: string;
  regionCode: string;
  regionName: string;
  countries: string[];
  currency: string;
  defaultFulfillmentPartner: string | null;
  defaultProductionDays: number;
  defaultShippingDays: number;
}

export interface PrintProduct {
  id: string;
  name: string;
  description: string | null;
  category: 'print' | 'frame' | 'canvas' | 'photobook' | 'merchandise';
  sizeCode: string;
  widthInches: number | null;
  heightInches: number | null;
}

export interface ProductPricing {
  productId: string;
  regionCode: string;
  currency: string;
  baseCost: number;
  basePrice: number;
  suggestedPrice: number;
  maxPrice: number | null;
  shippingCost: number;
  fulfillmentPartner: string | null;
  productionDays: number;
  shippingDays: number;
}

export interface ProductWithPricing extends PrintProduct {
  pricing: ProductPricing;
  formattedPrice: string;
  formattedSuggestedPrice: string;
}

// ============================================
// CURRENCY FORMATTING
// ============================================

const CURRENCY_CONFIG: Record<string, { symbol: string; position: 'before' | 'after'; decimals: number }> = {
  USD: { symbol: '$', position: 'before', decimals: 2 },
  GBP: { symbol: '£', position: 'before', decimals: 2 },
  EUR: { symbol: '€', position: 'before', decimals: 2 },
  GHS: { symbol: 'GHS ', position: 'before', decimals: 2 },
  NGN: { symbol: '₦', position: 'before', decimals: 0 },
  KES: { symbol: 'KES ', position: 'before', decimals: 0 },
  ZAR: { symbol: 'R', position: 'before', decimals: 2 },
  UGX: { symbol: 'UGX ', position: 'before', decimals: 0 },
};

export function formatPrice(cents: number, currency: string): string {
  const config = CURRENCY_CONFIG[currency] || { symbol: currency + ' ', position: 'before', decimals: 2 };
  const amount = cents / 100;
  
  const formatted = config.decimals === 0 
    ? Math.round(amount).toLocaleString()
    : amount.toFixed(config.decimals);
  
  return config.position === 'before' 
    ? `${config.symbol}${formatted}`
    : `${formatted} ${config.symbol}`;
}

// ============================================
// GET REGION FOR COUNTRY
// ============================================

export async function getRegionForCountry(countryCode: string): Promise<PrintRegion | null> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('print_regions')
    .select('*')
    .contains('countries', [countryCode])
    .eq('is_active', true)
    .single();

  if (!data) {
    // Fallback to US region
    const { data: usRegion } = await supabase
      .from('print_regions')
      .select('*')
      .eq('region_code', 'US')
      .single();
    
    if (!usRegion) return null;
    
    return {
      id: usRegion.id,
      regionCode: usRegion.region_code,
      regionName: usRegion.region_name,
      countries: usRegion.countries,
      currency: usRegion.currency,
      defaultFulfillmentPartner: usRegion.default_fulfillment_partner,
      defaultProductionDays: usRegion.default_production_days,
      defaultShippingDays: usRegion.default_shipping_days,
    };
  }

  return {
    id: data.id,
    regionCode: data.region_code,
    regionName: data.region_name,
    countries: data.countries,
    currency: data.currency,
    defaultFulfillmentPartner: data.default_fulfillment_partner,
    defaultProductionDays: data.default_production_days,
    defaultShippingDays: data.default_shipping_days,
  };
}

// ============================================
// GET ALL PRODUCTS FOR COUNTRY
// ============================================

export async function getProductsForCountry(countryCode: string): Promise<ProductWithPricing[]> {
  const supabase = createServiceClient();
  
  // Use the database function for efficient lookup
  const { data, error } = await supabase.rpc('get_products_for_country', {
    p_country_code: countryCode,
  });

  if (error || !data) {
    console.error('Error fetching products:', error);
    return [];
  }

  // Get full product details
  const productIds = [...new Set(data.map((d: { product_id: string }) => d.product_id))];
  
  const { data: products } = await supabase
    .from('print_products')
    .select('*')
    .in('id', productIds);

  if (!products) return [];

  // Combine product details with pricing
  return data.map((pricing: {
    product_id: string;
    region_code: string;
    currency: string;
    base_price: number;
    suggested_price: number;
    max_price: number | null;
    shipping_cost: number;
    production_days: number;
    shipping_days: number;
  }) => {
    const product = products.find(p => p.id === pricing.product_id);
    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      sizeCode: product.size_code,
      widthInches: product.width_inches,
      heightInches: product.height_inches,
      pricing: {
        productId: pricing.product_id,
        regionCode: pricing.region_code,
        currency: pricing.currency,
        baseCost: 0, // Not exposed to frontend
        basePrice: pricing.base_price,
        suggestedPrice: pricing.suggested_price,
        maxPrice: pricing.max_price,
        shippingCost: pricing.shipping_cost,
        fulfillmentPartner: null, // Not exposed to frontend
        productionDays: pricing.production_days,
        shippingDays: pricing.shipping_days,
      },
      formattedPrice: formatPrice(pricing.base_price, pricing.currency),
      formattedSuggestedPrice: formatPrice(pricing.suggested_price, pricing.currency),
    };
  }).filter(Boolean) as ProductWithPricing[];
}

// ============================================
// GET SINGLE PRODUCT PRICING
// ============================================

export async function getProductPricing(
  productId: string, 
  countryCode: string
): Promise<ProductPricing | null> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('get_product_pricing', {
    p_product_id: productId,
    p_country_code: countryCode,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0];
  return {
    productId: row.product_id,
    regionCode: row.region_code,
    currency: row.currency,
    baseCost: row.base_cost,
    basePrice: row.base_price,
    suggestedPrice: row.suggested_price,
    maxPrice: row.max_price,
    shippingCost: row.shipping_cost,
    fulfillmentPartner: row.fulfillment_partner,
    productionDays: row.production_days,
    shippingDays: row.shipping_days,
  };
}

// ============================================
// CALCULATE ORDER TOTAL
// ============================================

export interface OrderCalculation {
  productPrice: number;
  photographerMarkup: number;
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  total: number;
  currency: string;
  
  // Commission breakdown
  platformShare: number;
  photographerShare: number;
  
  // Formatted
  formattedTotal: string;
  formattedSubtotal: string;
  formattedShipping: string;
}

export async function calculateOrderTotal(
  productId: string,
  countryCode: string,
  photographerMarkup: number,
  taxRate: number = 0
): Promise<OrderCalculation | null> {
  const pricing = await getProductPricing(productId, countryCode);
  
  if (!pricing) {
    return null;
  }

  const productPrice = pricing.suggestedPrice;
  const subtotal = productPrice + photographerMarkup;
  const taxAmount = Math.round(subtotal * taxRate);
  const total = subtotal + pricing.shippingCost + taxAmount;

  // Calculate commission split
  const platformMargin = pricing.basePrice - pricing.baseCost;
  const photographerCommissionPercent = 0.20; // 20% of platform margin (adjust based on plan)
  const photographerCommission = Math.round(platformMargin * photographerCommissionPercent);
  
  const photographerShare = photographerMarkup + photographerCommission;
  const platformShare = total - photographerShare - pricing.baseCost - pricing.shippingCost;

  return {
    productPrice,
    photographerMarkup,
    subtotal,
    shippingCost: pricing.shippingCost,
    taxAmount,
    total,
    currency: pricing.currency,
    platformShare,
    photographerShare,
    formattedTotal: formatPrice(total, pricing.currency),
    formattedSubtotal: formatPrice(subtotal, pricing.currency),
    formattedShipping: pricing.shippingCost > 0 
      ? formatPrice(pricing.shippingCost, pricing.currency)
      : 'Free',
  };
}

// ============================================
// GET PRODUCTS BY CATEGORY
// ============================================

export async function getProductsByCategory(
  countryCode: string
): Promise<Record<string, ProductWithPricing[]>> {
  const products = await getProductsForCountry(countryCode);
  
  return products.reduce((acc, product) => {
    const category = product.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(product);
    return acc;
  }, {} as Record<string, ProductWithPricing[]>);
}

// ============================================
// CHECK PRODUCT AVAILABILITY
// ============================================

export async function isProductAvailable(
  productId: string,
  countryCode: string
): Promise<boolean> {
  const pricing = await getProductPricing(productId, countryCode);
  return pricing !== null;
}

// ============================================
// GET ALL REGIONS
// ============================================

export async function getAllRegions(): Promise<PrintRegion[]> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('print_regions')
    .select('*')
    .eq('is_active', true)
    .order('region_name');

  if (!data) return [];

  return data.map(row => ({
    id: row.id,
    regionCode: row.region_code,
    regionName: row.region_name,
    countries: row.countries,
    currency: row.currency,
    defaultFulfillmentPartner: row.default_fulfillment_partner,
    defaultProductionDays: row.default_production_days,
    defaultShippingDays: row.default_shipping_days,
  }));
}
