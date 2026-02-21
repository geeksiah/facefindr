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
let baseCurrencyCache: string | null = null;
let baseCurrencyCacheTime = 0;

// Default currencies (fallback when database is empty)
const DEFAULT_CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', symbolPosition: 'before', decimalPlaces: 2, countries: ['US'] },
  { code: 'EUR', name: 'Euro', symbol: '€', symbolPosition: 'before', decimalPlaces: 2, countries: ['DE', 'FR', 'IT', 'ES', 'NL'] },
  { code: 'GBP', name: 'British Pound', symbol: '£', symbolPosition: 'before', decimalPlaces: 2, countries: ['GB'] },
  { code: 'GHS', name: 'Ghana Cedi', symbol: '₵', symbolPosition: 'before', decimalPlaces: 2, countries: ['GH'] },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', symbolPosition: 'before', decimalPlaces: 2, countries: ['NG'] },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', symbolPosition: 'before', decimalPlaces: 2, countries: ['KE'] },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', symbolPosition: 'before', decimalPlaces: 2, countries: ['ZA'] },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', symbolPosition: 'before', decimalPlaces: 2, countries: ['CA'] },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', symbolPosition: 'before', decimalPlaces: 2, countries: ['AU'] },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', symbolPosition: 'before', decimalPlaces: 0, countries: ['JP'] },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', symbolPosition: 'before', decimalPlaces: 2, countries: ['IN'] },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', symbolPosition: 'before', decimalPlaces: 0, countries: ['UG'] },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', symbolPosition: 'before', decimalPlaces: 0, countries: ['TZ'] },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', symbolPosition: 'before', decimalPlaces: 0, countries: ['RW'] },
  { code: 'XOF', name: 'West African CFA', symbol: 'CFA', symbolPosition: 'after', decimalPlaces: 0, countries: ['SN', 'CI', 'BF', 'ML'] },
  { code: 'XAF', name: 'Central African CFA', symbol: 'FCFA', symbolPosition: 'after', decimalPlaces: 0, countries: ['CM', 'GA', 'CG'] },
];

const COUNTRY_CURRENCY_FALLBACK: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  GH: 'GHS',
  NG: 'NGN',
  KE: 'KES',
  ZA: 'ZAR',
  UG: 'UGX',
  TZ: 'TZS',
  RW: 'RWF',
  SN: 'XOF',
  CI: 'XOF',
  CM: 'XAF',
  JP: 'JPY',
  IN: 'INR',
  CA: 'CAD',
  AU: 'AUD',
};

export async function getSupportedCurrencies(): Promise<Map<string, Currency>> {
  const now = Date.now();
  
  if (currencyCache && currencyCache.size > 0 && (now - currencyCacheTime) < CACHE_TTL) {
    return currencyCache;
  }

  currencyCache = new Map();

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('supported_currencies')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (!error && data && data.length > 0) {
      for (const row of data) {
        currencyCache.set(row.code, {
          code: row.code,
          name: row.name,
          symbol: row.symbol,
          symbolPosition: row.symbol_position || 'before',
          decimalPlaces: row.decimal_places || 2,
          countries: row.countries || [],
        });
      }
    } else {
      // Use default currencies as fallback
      for (const currency of DEFAULT_CURRENCIES) {
        currencyCache.set(currency.code, currency);
      }
    }
  } catch {
    // Use default currencies on error
    for (const currency of DEFAULT_CURRENCIES) {
      currencyCache.set(currency.code, currency);
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
  const normalizedCountry = countryCode.trim().toUpperCase();
  const currencies = await getSupportedCurrencies();
  
  for (const [code, currency] of currencies) {
    if (currency.countries.map((value) => String(value).toUpperCase()).includes(normalizedCountry)) {
      return code;
    }
  }

  const fallbackCode = COUNTRY_CURRENCY_FALLBACK[normalizedCountry];
  if (fallbackCode) {
    return fallbackCode;
  }
  
  return getPlatformBaseCurrency();
}

function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  if (value && typeof value === 'object') {
    const nested = (value as any).code || (value as any).currency;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim().toUpperCase();
    }
  }
  return null;
}

export async function getPlatformBaseCurrency(): Promise<string> {
  const now = Date.now();
  if (baseCurrencyCache && now - baseCurrencyCacheTime < CACHE_TTL) {
    return baseCurrencyCache;
  }

  let fallbackCurrency = 'USD';

  try {
    const supported = await getSupportedCurrencies();
    const firstSupported = supported.values().next().value as Currency | undefined;
    if (firstSupported?.code) {
      fallbackCurrency = firstSupported.code.toUpperCase();
    }
  } catch {
    // Use USD fallback.
  }

  try {
    const supabase = createServiceClient();
    const { data: setting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('setting_key', 'platform_base_currency')
      .maybeSingle();

    const configured = normalizeCurrencyCode(setting?.value);
    baseCurrencyCache = configured || fallbackCurrency;
    baseCurrencyCacheTime = now;
    return baseCurrencyCache;
  } catch {
    baseCurrencyCache = fallbackCurrency;
    baseCurrencyCacheTime = now;
    return fallbackCurrency;
  }
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
  const normalizedCountry = countryCode.trim().toUpperCase();
  const currency = await getCurrencyForCountry(normalizedCountry);
  
  await supabase
    .from('user_currency_preferences')
    .upsert({
      user_id: userId,
      detected_country: normalizedCountry,
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
  
  return getPlatformBaseCurrency();
}

// ============================================
// EXCHANGE RATES
// ============================================

let rateCache: Map<string, number> | null = null;
let rateCacheTime = 0;
const RATE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const RATE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RATE_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXCHANGE_BASE_CURRENCY = 'USD';
let rateRefreshInFlight: Promise<Map<string, number> | null> | null = null;

function parseProviderRates(payload: any, currencyCodes: string[]): Map<string, number> {
  const parsed = new Map<string, number>();
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') {
    return parsed;
  }

  for (const code of currencyCodes) {
    if (code === EXCHANGE_BASE_CURRENCY) {
      parsed.set(code, 1);
      continue;
    }
    const value = Number((rates as Record<string, unknown>)[code]);
    if (Number.isFinite(value) && value > 0) {
      parsed.set(code, value);
    }
  }

  return parsed;
}

async function fetchRatesFromProvider(currencyCodes: string[]): Promise<{ rates: Map<string, number>; source: string } | null> {
  const symbols = currencyCodes.join(',');
  const configuredUrl = process.env.EXCHANGE_RATE_API_URL;
  const candidates: Array<{ url: string; source: string }> = [];

  if (configuredUrl) {
    const url = configuredUrl
      .replace('{base}', EXCHANGE_BASE_CURRENCY)
      .replace('{symbols}', encodeURIComponent(symbols));
    candidates.push({ url, source: 'configured_api' });
  }

  candidates.push(
    {
      url: `https://open.er-api.com/v6/latest/${EXCHANGE_BASE_CURRENCY}`,
      source: 'open_er_api',
    },
    {
      url: `https://api.exchangerate.host/latest?base=${EXCHANGE_BASE_CURRENCY}&symbols=${encodeURIComponent(symbols)}`,
      source: 'exchangerate_host',
    }
  );

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const rates = parseProviderRates(payload, currencyCodes);
      if (rates.size > 0) {
        rates.set(EXCHANGE_BASE_CURRENCY, 1);
        return { rates, source: candidate.source };
      }
    } catch {
      // try next provider candidate
    }
  }

  return null;
}

async function maybeRefreshRates(
  supabase: ReturnType<typeof createServiceClient>,
  currencyCodes: string[],
  force = false
): Promise<Map<string, number> | null> {
  if (rateRefreshInFlight && !force) {
    return rateRefreshInFlight;
  }

  const refreshPromise = (async () => {
    const providerResult = await fetchRatesFromProvider(currencyCodes);
    if (!providerResult) {
      return null;
    }

    const validFrom = new Date().toISOString();
    const validUntil = new Date(Date.now() + RATE_VALIDITY_MS).toISOString();
    const payload = Array.from(providerResult.rates.entries()).map(([toCurrency, rate]) => ({
      from_currency: EXCHANGE_BASE_CURRENCY,
      to_currency: toCurrency,
      rate,
      valid_from: validFrom,
      valid_until: validUntil,
      source: providerResult.source,
    }));

    const { error } = await supabase.from('exchange_rates').insert(payload);
    if (error) {
      console.error('Exchange rate persist error:', error);
      // Keep runtime conversion working even when persistence is unavailable.
      return providerResult.rates;
    }

    return providerResult.rates;
  })();

  rateRefreshInFlight = refreshPromise;
  const result = await refreshPromise;
  rateRefreshInFlight = null;
  return result;
}

export async function getExchangeRates(): Promise<Map<string, number>> {
  const now = Date.now();
  
  if (rateCache && (now - rateCacheTime) < RATE_CACHE_TTL) {
    return rateCache;
  }

  const supabase = createServiceClient();
  const [currencyMap, rateResult] = await Promise.all([
    getSupportedCurrencies(),
    supabase
      .from('exchange_rates')
      .select('to_currency, rate, valid_from, created_at')
      .eq('from_currency', EXCHANGE_BASE_CURRENCY)
      .or('valid_until.is.null,valid_until.gt.now()')
      .order('valid_from', { ascending: false }),
  ]);
  if (rateResult.error) {
    console.error('Exchange rate lookup error:', rateResult.error);
  }

  const currencyCodes = Array.from(currencyMap.keys()).map((code) => code.toUpperCase());
  if (!currencyCodes.includes(EXCHANGE_BASE_CURRENCY)) {
    currencyCodes.push(EXCHANGE_BASE_CURRENCY);
  }

  rateCache = new Map();
  rateCache.set(EXCHANGE_BASE_CURRENCY, 1);

  let latestValidAt = 0;
  const seen = new Set<string>();
  for (const row of rateResult.data || []) {
    const code = String(row.to_currency || '').toUpperCase();
    if (!code || seen.has(code)) continue;
    const rate = Number(row.rate);
    if (Number.isFinite(rate) && rate > 0) {
      rateCache.set(code, rate);
      seen.add(code);
    }
    const ts = Date.parse(String(row.valid_from || row.created_at || ''));
    if (Number.isFinite(ts) && ts > latestValidAt) {
      latestValidAt = ts;
    }
  }

  const hasMissingRates = currencyCodes.some(
    (code) => code !== EXCHANGE_BASE_CURRENCY && !rateCache?.has(code)
  );
  const stale = !latestValidAt || now - latestValidAt > RATE_REFRESH_INTERVAL_MS;
  if (hasMissingRates || stale) {
    const refreshed = await maybeRefreshRates(supabase, currencyCodes);
    if (refreshed) {
      rateCache = refreshed;
      rateCache.set(EXCHANGE_BASE_CURRENCY, 1);
    }
  }
  
  rateCacheTime = now;
  return rateCache;
}

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (!from || !to || from === to) return 1;
  
  const rates = await getExchangeRates();
  
  // Convert through USD
  const fromRate = rates.get(from) || 1;
  const toRate = rates.get(to) || 1;
  
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
  const normalizeCountry = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
  };

  // Vercel provides this header
  const country = normalizeCountry(headers.get('x-vercel-ip-country'));
  if (country) return country;
  
  // Cloudflare provides this
  const cfCountry = normalizeCountry(headers.get('cf-ipcountry'));
  if (cfCountry) return cfCountry;
  
  return null;
}
