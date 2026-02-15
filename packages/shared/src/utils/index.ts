/**
 * FaceFindr Utilities
 * Shared helper functions
 */

import { FACETAG_SUFFIX_LENGTH, FACETAG_USERNAME_REGEX, PLATFORM_FEES } from '../constants';
import type { SubscriptionPlan } from '../types';

// ============================================
// FACETAG UTILITIES
// ============================================

/**
 * Generate a random numeric suffix for FaceTag (4 digits)
 */
export function generateFaceTagSuffix(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Format a FaceTag from username and suffix
 * Format: @username1234 (e.g., @amara1234)
 */
export function formatFaceTag(username: string, suffix: string): string {
  // Clean username: lowercase, alphanumeric only
  const cleanUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  // Suffix should be numeric (4-5 digits)
  const cleanSuffix = suffix.replace(/[^0-9]/g, '');
  return `@${cleanUsername}${cleanSuffix}`;
}

/**
 * Parse a FaceTag into username and suffix
 * Format: @username1234 (numeric suffix appended)
 */
export function parseFaceTag(faceTag: string): { username: string; suffix: string } | null {
  // Match @username followed by 4-5 digits
  const match = faceTag.match(/^@([a-z0-9]{4,8})(\d{4,5})$/i);
  if (!match) return null;
  return { username: match[1].toLowerCase(), suffix: match[2] };
}

/**
 * Validate a username for FaceTag
 */
export function isValidFaceTagUsername(username: string): boolean {
  return (
    username.length >= 3 && username.length <= 20 && FACETAG_USERNAME_REGEX.test(username)
  );
}

// ============================================
// CURRENCY UTILITIES
// ============================================

/**
 * Format currency amount from cents to display string
 */
export function formatCurrency(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Format date for display
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = (() => {
    if (typeof date !== 'string') return date;
    const value = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
    return new Date(value);
  })();
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: options?.timeZone || (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'UTC' : undefined),
    ...options,
  });
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return formatDate(d);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if a date is expired
 */
export function isExpired(expiresAt: string | Date | null): boolean {
  if (!expiresAt) return false;
  const d = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return d.getTime() < Date.now();
}

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Generate a secure random token
 */
export function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < length; i++) {
    token += chars[array[i] % chars.length];
  }
  return token;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Slugify a string for URLs
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================
// FILE UTILITIES
// ============================================

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename);
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// ============================================
// PLATFORM FEE CALCULATION
// ============================================

/**
 * Calculate platform fee and net amount
 */
export function calculateFees(
  grossAmount: number,
  plan: SubscriptionPlan
): {
  platformFee: number;
  stripeFee: number;
  netAmount: number;
} {
  const platformFeeRate = PLATFORM_FEES[plan];
  const platformFee = Math.round(grossAmount * platformFeeRate);

  // Stripe fee: 2.9% + $0.30
  const stripeFee = Math.round(grossAmount * 0.029 + 30);

  const netAmount = grossAmount - platformFee - stripeFee;

  return { platformFee, stripeFee, netAmount };
}
