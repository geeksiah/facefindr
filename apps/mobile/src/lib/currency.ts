/**
 * Currency utilities for mobile app
 * 
 * Handles currency formatting and display.
 */

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', locale: 'en-NG' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', locale: 'en-GH' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', locale: 'en-KE' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', locale: 'en-ZA' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', locale: 'en-CA' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', locale: 'en-AU' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', locale: 'zh-CN' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', locale: 'pt-BR' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', locale: 'es-MX' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', locale: 'de-CH' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', locale: 'ar-AE' },
];

/**
 * Get currency info by code
 */
export function getCurrency(code: string): Currency | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code);
}

/**
 * Get currency symbol by code
 */
export function getCurrencySymbol(code: string): string {
  const currency = getCurrency(code);
  return currency?.symbol || code;
}

/**
 * Format amount with currency
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = 'USD',
  options: {
    showSymbol?: boolean;
    compact?: boolean;
    decimals?: number;
  } = {}
): string {
  const { showSymbol = true, compact = false, decimals } = options;
  const currency = getCurrency(currencyCode);
  
  if (!currency) {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }

  try {
    const formatter = new Intl.NumberFormat(currency.locale, {
      style: showSymbol ? 'currency' : 'decimal',
      currency: currencyCode,
      minimumFractionDigits: decimals ?? (compact ? 0 : 2),
      maximumFractionDigits: decimals ?? (compact ? 0 : 2),
      notation: compact && amount >= 1000 ? 'compact' : 'standard',
    });

    return formatter.format(amount);
  } catch {
    // Fallback for unsupported locales
    const formatted = amount.toFixed(decimals ?? 2);
    return showSymbol ? `${currency.symbol}${formatted}` : formatted;
  }
}

/**
 * Format price for display (shorthand)
 */
export function formatPrice(
  amount: number,
  currencyCode: string = 'USD'
): string {
  return formatCurrency(amount, currencyCode, { showSymbol: true });
}

/**
 * Format compact price (e.g., $1.2K)
 */
export function formatCompactPrice(
  amount: number,
  currencyCode: string = 'USD'
): string {
  return formatCurrency(amount, currencyCode, { showSymbol: true, compact: true });
}

/**
 * Convert between currencies (simplified - would need real exchange rates)
 * This is a placeholder for when you integrate a real exchange rate API
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  // Placeholder exchange rates (would be fetched from API in production)
  const rates: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    NGN: 1550,
    GHS: 15.5,
    KES: 153,
    ZAR: 18.5,
    CAD: 1.36,
    AUD: 1.53,
    INR: 83,
    JPY: 149,
    CNY: 7.24,
    BRL: 4.97,
    MXN: 17.1,
    CHF: 0.88,
    AED: 3.67,
  };

  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;

  // Convert to USD first, then to target currency
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}
