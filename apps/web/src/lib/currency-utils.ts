/**
 * Currency Utilities
 *
 * Provides currency symbol and formatting functions.
 */

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const normalized = String(currencyCode || '').toUpperCase();
  if (!normalized) return '';

  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
      currencyDisplay: 'symbol',
    }).formatToParts(1);
    const symbol = parts.find((part) => part.type === 'currency')?.value;
    return symbol || normalized;
  } catch {
    return normalized;
  }
}

/**
 * Get currency name for a currency code
 */
export function getCurrencyName(currencyCode: string): string {
  const normalized = String(currencyCode || '').toUpperCase();
  if (!normalized) return '';

  try {
    const display = new Intl.DisplayNames(['en'], { type: 'currency' });
    return display.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

/**
 * Format currency code with symbol for display
 */
export function formatCurrencyCode(currencyCode: string): string {
  const normalized = String(currencyCode || '').toUpperCase();
  const symbol = getCurrencySymbol(normalized);
  return `${normalized} (${symbol})`;
}
