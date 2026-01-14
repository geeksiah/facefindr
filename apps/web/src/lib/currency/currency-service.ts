/**
 * Currency Service
 * 
 * Handles currency detection, conversion, and user preferences.
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
  decimalPlaces: number;
  countries: string[];
}

export interface UserCurrencyPreference {
  userId: string;
  detectedCountry: string | null;
  detectedCurrency: string | null;
  preferredCurrency: string | null;
}

export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  validFrom: Date;
}

// ============================================
// CURRENCY DATA (Cached)
// ============================================

let currencyCache: Map<string, Currency> | null = null;
let currencyCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getSupportedCurrencies(): Promise<Map<string, Currency>> {
  const now = Date.now();
  
  if (currencyCache && (now - currencyCacheTime) < CACHE_TTL) {
    return currencyCache;
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('supported_currencies')
    .select('*')
    .eq('is_active', true)
    .order('display_order');

  currencyCache = new Map();
  
  if (data) {
    for (const row of data) {
      currencyCache.set(row.code, {
        code: row.code,
        name: row.name,
        symbol: row.symbol,
        symbolPosition: row.symbol_position,
        decimalPlaces: row.decimal_places,
        countries: row.countries,
      });
    }
  }
  
  currencyCacheTime = now;
  return currencyCache;
}

export async function getCurrency(code: string): Promise<Currency | null> {
  const currencies = await getSupportedCurrencies();
  return currencies.get(code) || null;
}

// ============================================
// COUNTRY TO CURRENCY MAPPING
// ============================================

export async function getCurrencyForCountry(countryCode: string): Promise<string> {
  const currencies = await getSupportedCurrencies();
  
  for (const [code, currency] of currencies) {
    if (currency.countries.includes(countryCode)) {
      return code;
    }
  }
  
  return 'USD'; // Default
}

// ============================================
// USER PREFERENCES
// ============================================

export async function getUserCurrencyPreference(
  userId: string
): Promise<UserCurrencyPreference | null> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('user_currency_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return null;

  return {
    userId: data.user_id,
    detectedCountry: data.detected_country,
    detectedCurrency: data.detected_currency,
    preferredCurrency: data.preferred_currency,
  };
}

export async function setUserCurrencyPreference(
  userId: string,
  preferredCurrency: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  
  const { error } = await supabase
    .from('user_currency_preferences')
    .upsert({
      user_id: userId,
      preferred_currency: preferredCurrency,
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function setDetectedLocation(
  userId: string,
  countryCode: string
): Promise<void> {
  const supabase = createServiceClient();
  const currency = await getCurrencyForCountry(countryCode);
  
  await supabase
    .from('user_currency_preferences')
    .upsert({
      user_id: userId,
      detected_country: countryCode,
      detected_currency: currency,
    }, {
      onConflict: 'user_id',
    });
}

// ============================================
// GET EFFECTIVE CURRENCY FOR USER
// ============================================

export async function getEffectiveCurrency(
  userId?: string,
  detectedCountry?: string
): Promise<string> {
  // If user is logged in, check their preference
  if (userId) {
    const pref = await getUserCurrencyPreference(userId);
    
    if (pref?.preferredCurrency) {
      return pref.preferredCurrency;
    }
    
    if (pref?.detectedCurrency) {
      return pref.detectedCurrency;
    }
  }
  
  // Use detected country
  if (detectedCountry) {
    return getCurrencyForCountry(detectedCountry);
  }
  
  return 'USD';
}

// ============================================
// EXCHANGE RATES
// ============================================

let rateCache: Map<string, number> | null = null;
let rateCacheTime = 0;
const RATE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function getExchangeRates(): Promise<Map<string, number>> {
  const now = Date.now();
  
  if (rateCache && (now - rateCacheTime) < RATE_CACHE_TTL) {
    return rateCache;
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('from_currency', 'USD')
    .or('valid_until.is.null,valid_until.gt.now()')
    .order('valid_from', { ascending: false });

  rateCache = new Map();
  rateCache.set('USD', 1);
  
  if (data) {
    // Get latest rate for each currency
    const seen = new Set<string>();
    for (const row of data) {
      if (!seen.has(row.to_currency)) {
        rateCache.set(row.to_currency, Number(row.rate));
        seen.add(row.to_currency);
      }
    }
  }
  
  rateCacheTime = now;
  return rateCache;
}

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;
  
  const rates = await getExchangeRates();
  
  // Convert through USD
  const fromRate = rates.get(fromCurrency) || 1;
  const toRate = rates.get(toCurrency) || 1;
  
  return toRate / fromRate;
}

// ============================================
// CURRENCY CONVERSION
// ============================================

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  if (fromCurrency === toCurrency) return amount;
  
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return Math.round(amount * rate);
}

// ============================================
// PRICE FORMATTING
// ============================================

export async function formatPrice(
  amountCents: number,
  currencyCode: string
): Promise<string> {
  const currency = await getCurrency(currencyCode);
  
  if (!currency) {
    return `${currencyCode} ${(amountCents / 100).toFixed(2)}`;
  }
  
  const amount = amountCents / 100;
  let formatted: string;
  
  if (currency.decimalPlaces === 0) {
    formatted = Math.round(amount).toLocaleString();
  } else {
    formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    });
  }
  
  if (currency.symbolPosition === 'before') {
    return `${currency.symbol}${formatted}`;
  } else {
    return `${formatted} ${currency.symbol}`;
  }
}

// Sync version for client-side use
export function formatPriceSync(
  amountCents: number,
  currency: Currency
): string {
  const amount = amountCents / 100;
  let formatted: string;
  
  if (currency.decimalPlaces === 0) {
    formatted = Math.round(amount).toLocaleString();
  } else {
    formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    });
  }
  
  if (currency.symbolPosition === 'before') {
    return `${currency.symbol}${formatted}`;
  } else {
    return `${formatted} ${currency.symbol}`;
  }
}

// ============================================
// SUBSCRIPTION PRICING
// ============================================

export interface SubscriptionPricing {
  planCode: string;
  currency: string;
  monthlyPrice: number;
  annualPrice: number;
  formattedMonthly: string;
  formattedAnnual: string;
  savings: number; // Annual savings vs monthly
}

export async function getSubscriptionPricing(
  currencyCode: string
): Promise<SubscriptionPricing[]> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('subscription_plan_pricing')
    .select('*')
    .eq('currency', currencyCode)
    .order('monthly_price');

  if (!data || data.length === 0) {
    // Fallback to USD
    const { data: usdData } = await supabase
      .from('subscription_plan_pricing')
      .select('*')
      .eq('currency', 'USD')
      .order('monthly_price');

    if (!usdData) return [];
    
    const rate = await getExchangeRate('USD', currencyCode);
    const currency = await getCurrency(currencyCode);
    
    return usdData.map(row => {
      const monthlyConverted = Math.round(row.monthly_price * rate);
      const annualConverted = Math.round(row.annual_price * rate);
      const monthlyCost = row.monthly_price * 12;
      const savings = Math.round((monthlyCost - row.annual_price) * rate);
      
      return {
        planCode: row.plan_code,
        currency: currencyCode,
        monthlyPrice: monthlyConverted,
        annualPrice: annualConverted,
        formattedMonthly: currency ? formatPriceSync(monthlyConverted, currency) : `${currencyCode} ${monthlyConverted / 100}`,
        formattedAnnual: currency ? formatPriceSync(annualConverted, currency) : `${currencyCode} ${annualConverted / 100}`,
        savings,
      };
    });
  }

  const currency = await getCurrency(currencyCode);
  
  return data.map(row => {
    const monthlyCost = row.monthly_price * 12;
    const savings = monthlyCost - row.annual_price;
    
    return {
      planCode: row.plan_code,
      currency: currencyCode,
      monthlyPrice: row.monthly_price,
      annualPrice: row.annual_price,
      formattedMonthly: currency ? formatPriceSync(row.monthly_price, currency) : `${currencyCode} ${row.monthly_price / 100}`,
      formattedAnnual: currency ? formatPriceSync(row.annual_price, currency) : `${currencyCode} ${row.annual_price / 100}`,
      savings,
    };
  });
}

// ============================================
// COUNTRY DETECTION FROM IP (Via Vercel headers or external API)
// ============================================

export function getCountryFromRequest(headers: Headers): string | null {
  // Vercel provides this header
  const country = headers.get('x-vercel-ip-country');
  if (country) return country;
  
  // Cloudflare provides this
  const cfCountry = headers.get('cf-ipcountry');
  if (cfCountry) return cfCountry;
  
  return null;
}
