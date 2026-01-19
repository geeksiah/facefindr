/**
 * Currency Utilities
 * 
 * Provides currency symbol and formatting functions
 */

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    AUD: 'A$',
    GHS: '₵',
    NGN: '₦',
    KES: 'KSh',
    ZAR: 'R',
    JPY: '¥',
    CNY: '¥',
    INR: '₹',
  };

  return symbols[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Get currency name for a currency code
 */
export function getCurrencyName(currencyCode: string): string {
  const names: Record<string, string> = {
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'British Pound',
    CAD: 'Canadian Dollar',
    AUD: 'Australian Dollar',
    GHS: 'Ghanaian Cedi',
    NGN: 'Nigerian Naira',
    KES: 'Kenyan Shilling',
    ZAR: 'South African Rand',
    JPY: 'Japanese Yen',
    CNY: 'Chinese Yuan',
    INR: 'Indian Rupee',
  };

  return names[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Format currency code with symbol for display
 */
export function formatCurrencyCode(currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode);
  return `${currencyCode} (${symbol})`;
}
