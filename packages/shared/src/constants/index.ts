/**
 * Ferchr Constants
 * Central source of truth for all application constants
 */

import type { PlanLimits, SubscriptionPlan } from '../types';

// ============================================
// SUBSCRIPTION PLANS
// ============================================

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    photos_per_event: 100,
    active_events: 1,
    face_ops_per_event: 0,
    retention_days: 30,
    face_recognition_enabled: false,
    priority_processing: false,
    api_access: false,
  },
  starter: {
    photos_per_event: 1000,
    active_events: 5,
    face_ops_per_event: 2000,
    retention_days: 30,
    face_recognition_enabled: true,
    priority_processing: false,
    api_access: false,
  },
  pro: {
    photos_per_event: 5000,
    active_events: 20,
    face_ops_per_event: 10000,
    retention_days: 90,
    face_recognition_enabled: true,
    priority_processing: false,
    api_access: false,
  },
  studio: {
    photos_per_event: 20000,
    active_events: Infinity,
    face_ops_per_event: 50000,
    retention_days: 365,
    face_recognition_enabled: true,
    priority_processing: true,
    api_access: true,
  },
};

export const PLAN_PRICING = {
  starter: {
    monthly: 1500, // $15.00 in cents
    annual: 14400, // $144.00 in cents
  },
  pro: {
    monthly: 3900, // $39.00 in cents
    annual: 37400, // $374.00 in cents
  },
  studio: {
    monthly: 9900, // $99.00 in cents
    annual: 95000, // $950.00 in cents
  },
} as const;

export const PLATFORM_FEES: Record<SubscriptionPlan, number> = {
  free: 0.25, // 25% (but payments disabled)
  starter: 0.2, // 20%
  pro: 0.15, // 15%
  studio: 0.1, // 10%
};

// ============================================
// FILE UPLOAD
// ============================================

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_BATCH_SIZE = 100; // Max photos per upload batch

export const THUMBNAIL_SIZE = 400; // Longest edge in pixels
export const PREVIEW_SIZE = 1200; // Longest edge for watermarked preview

// ============================================
// FACE RECOGNITION
// ============================================

export const FACE_MATCH_THRESHOLD = 80; // Minimum confidence % for match
export const FACE_DETECTION_MIN_CONFIDENCE = 90; // Minimum detection confidence
export const FACE_SCAN_TIMEOUT_MS = 10000; // 10 seconds max for face scan
export const MAX_FACES_PER_PHOTO = 100; // AWS Rekognition limit

// Face refresh thresholds (in months)
export const FACE_REFRESH_SCHEDULE = {
  under_13: 6,
  '13_18': 9,
  '18_25': 12,
  '25_50': 18,
  over_50: 24,
} as const;

export const FACE_CONFIDENCE_REFRESH_THRESHOLD = 75; // Prompt refresh below this %

// ============================================
// SESSION & AUTH
// ============================================

export const SESSION_EXPIRY_DAYS = 30;
export const PASSWORD_MIN_LENGTH = 8;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

// ============================================
// FACETAG
// ============================================

export const FACETAG_SUFFIX_LENGTH = 4;
export const FACETAG_CHANGE_COOLDOWN_DAYS = 365;
export const FACETAG_REDIRECT_DURATION_DAYS = 90;
export const FACETAG_USERNAME_MIN_LENGTH = 3;
export const FACETAG_USERNAME_MAX_LENGTH = 20;
export const FACETAG_USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// ============================================
// NOTIFICATIONS
// ============================================

export const PHOTO_DROP_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
export const LIVE_EVENT_NOTIFICATION_DELAY_MS = 5 * 60 * 1000; // 5 minutes
export const BATCH_NOTIFICATION_DELAY_MS = 2 * 60 * 1000; // 2 minutes

// ============================================
// RATE LIMITS
// ============================================

export const RATE_LIMITS = {
  face_scan: { requests: 10, window_ms: 60 * 1000 }, // 10 per minute
  upload: { requests: 100, window_ms: 60 * 1000 }, // 100 per minute
  checkout: { requests: 5, window_ms: 60 * 1000 }, // 5 per minute
  api_general: { requests: 100, window_ms: 60 * 1000 }, // 100 per minute
} as const;

// ============================================
// EVENT DEFAULTS
// ============================================

export const DEFAULT_EVENT_EXPIRY_DAYS = 30;
export const MAX_EVENT_EXPIRY_DAYS: Record<SubscriptionPlan, number> = {
  free: 30,
  starter: 30,
  pro: 90,
  studio: 365,
};

// ============================================
// CURRENCIES
// ============================================

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const;
export const DEFAULT_CURRENCY = 'USD';

// ============================================
// PRINT PRODUCTS (Future)
// ============================================

export const PRINT_PRODUCTS = {
  photo_print: {
    '4x6': { base_price: 50 }, // $0.50
    '5x7': { base_price: 200 }, // $2.00
    '8x10': { base_price: 500 }, // $5.00
    '11x14': { base_price: 1200 }, // $12.00
  },
  canvas: {
    '8x10': { base_price: 3500 },
    '12x16': { base_price: 5500 },
    '16x20': { base_price: 7500 },
    '24x36': { base_price: 12000 },
  },
  metal_print: {
    '8x10': { base_price: 4500 },
    '12x16': { base_price: 7500 },
    '16x20': { base_price: 10000 },
  },
} as const;

// ============================================
// ERROR CODES
// ============================================

export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',

  // Subscription
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_LIMIT_REACHED: 'SUBSCRIPTION_LIMIT_REACHED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',

  // Events
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_ACCESS_DENIED: 'EVENT_ACCESS_DENIED',
  EVENT_EXPIRED: 'EVENT_EXPIRED',
  EVENT_LIMIT_REACHED: 'EVENT_LIMIT_REACHED',

  // Media
  MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  MEDIA_TYPE_NOT_ALLOWED: 'MEDIA_TYPE_NOT_ALLOWED',
  MEDIA_SIZE_EXCEEDED: 'MEDIA_SIZE_EXCEEDED',
  MEDIA_LIMIT_REACHED: 'MEDIA_LIMIT_REACHED',

  // Face Recognition
  FACE_NOT_DETECTED: 'FACE_NOT_DETECTED',
  FACE_QUOTA_EXCEEDED: 'FACE_QUOTA_EXCEEDED',
  FACE_SCAN_FAILED: 'FACE_SCAN_FAILED',
  FACE_RECOGNITION_DISABLED: 'FACE_RECOGNITION_DISABLED',

  // Payments
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_WALLET_NOT_CONNECTED: 'PAYMENT_WALLET_NOT_CONNECTED',
  PAYMENT_ALREADY_PURCHASED: 'PAYMENT_ALREADY_PURCHASED',

  // Consent
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  CONSENT_WITHDRAWN: 'CONSENT_WITHDRAWN',

  // General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
