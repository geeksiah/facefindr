/**
 * Currency utilities for mobile app.
 * Uses Intl for formatting and requires explicit rates for conversion.
 */

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

const DEFAULT_LOCALE = 'en-US';

function detectSymbol(code: string, locale = DEFAULT_LOCALE): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
    }).formatToParts(1);
    const currencyPart = parts.find((part) => part.type === 'currency');
    return currencyPart?.value || code;
  } catch {
    return code;
  }
}

export function getCurrency(code: string): Currency {
  const normalized = (code || 'USD').toUpperCase();
  let name = normalized;
  try {
    const display = new Intl.DisplayNames(['en'], { type: 'currency' });
    name = display.of(normalized) || normalized;
  } catch {
    // Keep code fallback.
  }
  return {
    code: normalized,
    name,
    symbol: detectSymbol(normalized),
    locale: DEFAULT_LOCALE,
  };
}

export function getCurrencySymbol(code: string): string {
  return getCurrency(code).symbol;
}

export function formatCurrency(
  amount: number,
  currencyCode = 'USD',
  options: {
    showSymbol?: boolean;
    compact?: boolean;
    decimals?: number;
    locale?: string;
  } = {}
): string {
  const { showSymbol = true, compact = false, decimals, locale = DEFAULT_LOCALE } = options;
  const normalized = (currencyCode || 'USD').toUpperCase();

  try {
    return new Intl.NumberFormat(locale, {
      style: showSymbol ? 'currency' : 'decimal',
      currency: normalized,
      minimumFractionDigits: decimals ?? (compact ? 0 : 2),
      maximumFractionDigits: decimals ?? (compact ? 0 : 2),
      notation: compact && amount >= 1000 ? 'compact' : 'standard',
    }).format(amount);
  } catch {
    const formatted = amount.toFixed(decimals ?? 2);
    return showSymbol ? `${normalized} ${formatted}` : formatted;
  }
}

export function formatPrice(amount: number, currencyCode = 'USD'): string {
  return formatCurrency(amount, currencyCode, { showSymbol: true });
}

export function formatCompactPrice(amount: number, currencyCode = 'USD'): string {
  return formatCurrency(amount, currencyCode, { showSymbol: true, compact: true });
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  const from = (fromCurrency || '').toUpperCase();
  const to = (toCurrency || '').toUpperCase();
  const fromRate = rates[from];
  const toRate = rates[to];

  if (!fromRate || !toRate) {
    throw new Error(`Missing exchange rate for ${from} or ${to}`);
  }

  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}
