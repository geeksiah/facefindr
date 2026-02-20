/**
 * Payout Configuration
 * 
 * Currency-aware minimum payouts and platform settings
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// DEFAULT MINIMUMS (Used if DB not available)
// ============================================

export const DEFAULT_PAYOUT_MINIMUMS: Record<string, number> = {
  USD: 5000,      // $50.00
  GHS: 10000,     // GHS 100.00
  NGN: 500000,    // NGN 5,000.00
  KES: 100000,    // KES 1,000.00
  GBP: 4000,      // £40.00
  EUR: 4500,      // €45.00
  ZAR: 50000,     // R500.00
  UGX: 10000000,  // UGX 100,000
  RWF: 5000000,   // RWF 50,000
  TZS: 5000000,   // TZS 50,000
};

// Human-readable minimum amounts for display
export const MINIMUM_DISPLAY: Record<string, string> = {
  USD: '$50',
  GHS: 'GHS 100',
  NGN: '₦5,000',
  KES: 'KES 1,000',
  GBP: '£40',
  EUR: '€45',
  ZAR: 'R500',
  UGX: 'UGX 100,000',
};

// ============================================
// GET SETTINGS FROM DATABASE
// ============================================

let cachedSettings: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getPlatformSettings(): Promise<Record<string, unknown>> {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const supabase = createServiceClient();
    let settingsQuery = await supabase
      .from('platform_settings')
      .select('setting_key, value, setting_value');

    const missingValueColumn =
      settingsQuery.error?.code === '42703' &&
      String(settingsQuery.error?.message || '').includes('value');
    const missingSettingValueColumn =
      settingsQuery.error?.code === '42703' &&
      String(settingsQuery.error?.message || '').includes('setting_value');

    if (missingValueColumn) {
      settingsQuery = await supabase
        .from('platform_settings')
        .select('setting_key, setting_value');
    } else if (missingSettingValueColumn) {
      settingsQuery = await supabase
        .from('platform_settings')
        .select('setting_key, value');
    }

    const { data } = settingsQuery;

    if (data) {
      cachedSettings = {};
      for (const row of data) {
        const rawValue = (row as any).value ?? (row as any).setting_value;
        if (typeof rawValue === 'string') {
          try {
            cachedSettings[row.setting_key] = JSON.parse(rawValue);
          } catch {
            cachedSettings[row.setting_key] = rawValue;
          }
        } else {
          cachedSettings[row.setting_key] = rawValue;
        }
      }
      cacheTimestamp = now;
      return cachedSettings;
    }
  } catch (error) {
    console.error('Failed to fetch platform settings:', error);
  }

  // Return defaults if DB fails
  return {
    payout_minimums: DEFAULT_PAYOUT_MINIMUMS,
    platform_fee_percent: 15,
    auto_payouts_enabled: true,
    instant_payout_fee_percent: 1,
  };
}

export async function getPayoutMinimum(currency: string): Promise<number> {
  const settings = await getPlatformSettings();
  const minimums = settings.payout_minimums as Record<string, number> || DEFAULT_PAYOUT_MINIMUMS;
  return minimums[currency] || minimums['USD'] || 5000;
}

export async function getPlatformFeePercent(): Promise<number> {
  const settings = await getPlatformSettings();
  return Number(settings.platform_fee_percent) || 15;
}

export async function getInstantPayoutFeePercent(): Promise<number> {
  const settings = await getPlatformSettings();
  return Number(settings.instant_payout_fee_percent) || 1;
}

export async function areAutoPayoutsEnabled(): Promise<boolean> {
  const settings = await getPlatformSettings();
  return settings.auto_payouts_enabled === true || settings.auto_payouts_enabled === 'true';
}

// ============================================
// PHOTOGRAPHER PAYOUT SETTINGS
// ============================================

export type PayoutFrequency = 'instant' | 'daily' | 'weekly' | 'monthly' | 'manual';

export interface CreatorPayoutSettings {
  payoutFrequency: PayoutFrequency;
  weeklyPayoutDay: number; // 1-7 (Monday-Sunday)
  monthlyPayoutDay: number; // 1-28
  preferredCurrency: string;
  autoPayoutEnabled: boolean;
  notifyOnSale: boolean;
  notifyOnPayout: boolean;
  notifyOnThreshold: boolean;
}

export const DEFAULT_PHOTOGRAPHER_SETTINGS: CreatorPayoutSettings = {
  payoutFrequency: 'weekly',
  weeklyPayoutDay: 1, // Monday
  monthlyPayoutDay: 1,
  preferredCurrency: 'USD',
  autoPayoutEnabled: true,
  notifyOnSale: true,
  notifyOnPayout: true,
  notifyOnThreshold: true,
};

export async function getCreatorPayoutSettings(
  photographerId: string
): Promise<CreatorPayoutSettings> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('payout_settings')
      .select('*')
      .eq('photographer_id', photographerId)
      .single();

    if (data) {
      return {
        payoutFrequency: data.payout_frequency || 'weekly',
        weeklyPayoutDay: data.weekly_payout_day || 1,
        monthlyPayoutDay: data.monthly_payout_day || 1,
        preferredCurrency: data.preferred_currency || 'USD',
        autoPayoutEnabled: data.auto_payout_enabled ?? true,
        notifyOnSale: data.notify_on_sale ?? true,
        notifyOnPayout: data.notify_on_payout ?? true,
        notifyOnThreshold: data.notify_on_threshold ?? true,
      };
    }
  } catch (error) {
    console.error('Failed to fetch photographer payout settings:', error);
  }

  return DEFAULT_PHOTOGRAPHER_SETTINGS;
}

export async function updateCreatorPayoutSettings(
  photographerId: string,
  settings: Partial<CreatorPayoutSettings>
): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    
    const updateData: Record<string, unknown> = {};
    if (settings.payoutFrequency !== undefined) updateData.payout_frequency = settings.payoutFrequency;
    if (settings.weeklyPayoutDay !== undefined) updateData.weekly_payout_day = settings.weeklyPayoutDay;
    if (settings.monthlyPayoutDay !== undefined) updateData.monthly_payout_day = settings.monthlyPayoutDay;
    if (settings.preferredCurrency !== undefined) updateData.preferred_currency = settings.preferredCurrency;
    if (settings.autoPayoutEnabled !== undefined) updateData.auto_payout_enabled = settings.autoPayoutEnabled;
    if (settings.notifyOnSale !== undefined) updateData.notify_on_sale = settings.notifyOnSale;
    if (settings.notifyOnPayout !== undefined) updateData.notify_on_payout = settings.notifyOnPayout;
    if (settings.notifyOnThreshold !== undefined) updateData.notify_on_threshold = settings.notifyOnThreshold;

    const { error } = await supabase
      .from('payout_settings')
      .upsert({
        photographer_id: photographerId,
        ...updateData,
      }, {
        onConflict: 'photographer_id',
      });

    return !error;
  } catch (error) {
    console.error('Failed to update photographer payout settings:', error);
    return false;
  }
}

// ============================================
// ADMIN CONTROLS REFERENCE
// ============================================

/**
 * Admin Dashboard Controls Needed:
 * 
 * PAYOUT MANAGEMENT:
 * - View payout queue (pending, processing, completed, failed)
 * - Process single payout manually
 * - Process batch payouts
 * - Retry failed payouts
 * - Pause/resume auto-payouts globally
 * - Pause payouts for specific photographer
 * - Adjust payout minimums per currency
 * - View payout history with filters
 * 
 * PLATFORM SETTINGS:
 * - Platform fee percentage
 * - Instant payout fee percentage
 * - Payout minimums by currency
 * - Supported currencies
 * - Photo pricing limits
 * - Event limits (photos, face ops)
 * 
 * USER MANAGEMENT:
 * - View all photographers
 * - View photographer details & earnings
 * - Suspend/unsuspend accounts
 * - Verify photographer identity
 * - View photographer payout history
 * 
 * TRANSACTION MANAGEMENT:
 * - View all transactions
 * - Issue refunds
 * - View transaction details
 * - Export transaction reports
 * 
 * ANALYTICS:
 * - Total platform revenue
 * - Total photographer payouts
 * - Transaction volume by provider
 * - Active events count
 * - User growth metrics
 * 
 * SUPPORT:
 * - View reported issues
 * - Access audit logs
 * - Send announcements
 */

export const ADMIN_CONTROLS = {
  payouts: [
    'view_payout_queue',
    'process_single_payout',
    'process_batch_payouts',
    'retry_failed_payouts',
    'pause_global_payouts',
    'pause_photographer_payouts',
    'adjust_payout_minimums',
    'view_payout_history',
    'export_payout_reports',
  ],
  settings: [
    'update_platform_fee',
    'update_instant_payout_fee',
    'update_payout_minimums',
    'manage_currencies',
    'update_pricing_limits',
    'update_event_limits',
  ],
  users: [
    'view_all_photographers',
    'view_photographer_details',
    'suspend_photographer',
    'verify_photographer',
    'view_photographer_payouts',
  ],
  transactions: [
    'view_all_transactions',
    'issue_refund',
    'view_transaction_details',
    'export_transaction_reports',
  ],
  analytics: [
    'view_revenue_dashboard',
    'view_payout_analytics',
    'view_user_metrics',
    'export_analytics',
  ],
};
