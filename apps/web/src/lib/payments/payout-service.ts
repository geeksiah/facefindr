/**
 * Payout Service
 * 
 * Handles automated payouts to photographers via various methods:
 * - Mobile Money (MTN, Vodafone, AirtelTigo)
 * - Bank Transfer
 * - Stripe Connect (automatic)
 * 
 * Payout Modes:
 * - INSTANT: Payout after each sale (higher fees)
 * - THRESHOLD: Payout when balance reaches minimum (e.g., $50)
 * - SCHEDULED: Payout on specific days (weekly/monthly)
 */

import { createMomoTransfer, createBankTransfer, isFlutterwaveConfigured } from './flutterwave';
import { createServiceClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

// Payout configuration
export const PAYOUT_CONFIG = {
  // Minimum balance for threshold payouts (in cents)
  MIN_THRESHOLD: 5000, // $50
  
  // Payout fee (deducted from photographer's balance)
  MOMO_FEE_PERCENT: 0, // Platform absorbs MoMo fees
  BANK_FEE_FLAT: 0, // Platform absorbs bank fees
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 60000, // 1 minute
};

export type PayoutMode = 'instant' | 'threshold' | 'scheduled' | 'manual';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PayoutRequest {
  walletId: string;
  amount: number; // in cents
  currency: string;
  mode: PayoutMode;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  providerReference?: string;
  error?: string;
}

// ============================================
// MAIN PAYOUT FUNCTION
// ============================================

export async function processPayout(request: PayoutRequest): Promise<PayoutResult> {
  const supabase = createServiceClient();
  const reference = `PO-${uuidv4().slice(0, 8).toUpperCase()}`;

  try {
    // Get wallet details
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select(`
        *,
        photographers (
          id,
          display_name,
          email
        )
      `)
      .eq('id', request.walletId)
      .single();

    if (walletError || !wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    if (!wallet.payouts_enabled) {
      return { success: false, error: 'Payouts not enabled for this wallet' };
    }

    // Create payout record
    const { data: payout, error: createError } = await supabase
      .from('payouts')
      .insert({
        wallet_id: wallet.id,
        payment_provider: wallet.provider,
        amount: request.amount,
        currency: request.currency,
        status: 'processing',
        payout_method: wallet.provider === 'momo' ? wallet.momo_provider : 'bank',
        provider_payout_id: reference,
      })
      .select()
      .single();

    if (createError || !payout) {
      return { success: false, error: 'Failed to create payout record' };
    }

    // Process based on provider
    let result: PayoutResult;

    switch (wallet.provider) {
      case 'momo':
        result = await processMomoPayout(wallet, request, reference);
        break;
      case 'flutterwave':
        result = await processBankPayout(wallet, request, reference);
        break;
      case 'stripe':
        // Stripe Connect handles payouts automatically
        result = { success: true, payoutId: payout.id, providerReference: 'stripe-auto' };
        break;
      default:
        result = { success: false, error: 'Unsupported provider' };
    }

    // Update payout status
    await supabase
      .from('payouts')
      .update({
        status: result.success ? 'completed' : 'failed',
        failure_reason: result.error,
        completed_at: result.success ? new Date().toISOString() : null,
      })
      .eq('id', payout.id);

    return {
      ...result,
      payoutId: payout.id,
    };
  } catch (error) {
    console.error('Payout error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payout failed',
    };
  }
}

// ============================================
// MOBILE MONEY PAYOUT
// ============================================

async function processMomoPayout(
  wallet: { momo_account_number: string; momo_provider: string; photographers: { display_name: string } },
  request: PayoutRequest,
  reference: string
): Promise<PayoutResult> {
  if (!isFlutterwaveConfigured()) {
    return { success: false, error: 'Flutterwave not configured' };
  }

  try {
    const result = await createMomoTransfer({
      reference,
      amount: request.amount,
      currency: request.currency,
      phoneNumber: wallet.momo_account_number,
      network: wallet.momo_provider as 'MTN' | 'VODAFONE' | 'TIGO' | 'AIRTEL',
      beneficiaryName: wallet.photographers?.display_name || 'FaceFindr Photographer',
      narration: `FaceFindr earnings payout - ${reference}`,
    });

    if (result.status === 'success') {
      return {
        success: true,
        providerReference: result.data?.id?.toString(),
      };
    } else {
      return {
        success: false,
        error: result.message || 'Transfer failed',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'MoMo transfer failed',
    };
  }
}

// ============================================
// BANK TRANSFER PAYOUT
// ============================================

async function processBankPayout(
  wallet: { 
    flutterwave_subaccount_id?: string;
    photographers: { display_name: string };
  },
  request: PayoutRequest,
  reference: string
): Promise<PayoutResult> {
  // For Flutterwave subaccounts, payouts are automatic via split
  // This is for manual bank transfers if needed
  
  return {
    success: true,
    providerReference: 'subaccount-auto',
  };
}

// ============================================
// BATCH PAYOUT PROCESSOR (Run by cron/scheduler)
// ============================================

export interface BatchPayoutResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ walletId: string; error: string }>;
}

export async function processPendingPayouts(
  mode: 'threshold' | 'scheduled'
): Promise<BatchPayoutResult> {
  const supabase = createServiceClient();
  const results: BatchPayoutResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get all wallets with pending balances
    const { data: balances } = await supabase
      .from('wallet_balances')
      .select('*')
      .gt('available_balance', mode === 'threshold' ? PAYOUT_CONFIG.MIN_THRESHOLD : 0);

    if (!balances || balances.length === 0) {
      return results;
    }

    // Process each wallet
    for (const balance of balances) {
      results.processed++;

      // Skip if below threshold for threshold mode
      if (mode === 'threshold' && balance.available_balance < PAYOUT_CONFIG.MIN_THRESHOLD) {
        continue;
      }

      const result = await processPayout({
        walletId: balance.wallet_id,
        amount: balance.available_balance,
        currency: balance.currency,
        mode,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          walletId: balance.wallet_id,
          error: result.error || 'Unknown error',
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Batch payout error:', error);
    return results;
  }
}

// ============================================
// PAYOUT SETTINGS (Per photographer)
// ============================================

export interface PayoutSettings {
  mode: PayoutMode;
  threshold?: number; // For threshold mode
  scheduledDay?: number; // 1-28 for monthly, 1-7 for weekly
  scheduleType?: 'weekly' | 'monthly';
  minimumPayout: number;
  autoPayoutEnabled: boolean;
}

export const DEFAULT_PAYOUT_SETTINGS: PayoutSettings = {
  mode: 'threshold',
  threshold: PAYOUT_CONFIG.MIN_THRESHOLD,
  minimumPayout: 1000, // $10
  autoPayoutEnabled: true,
};

// ============================================
// ADMIN FUNCTIONS
// ============================================

export async function getPayoutQueue(): Promise<{
  pending: number;
  totalAmount: number;
  byProvider: Record<string, { count: number; amount: number }>;
}> {
  const supabase = createServiceClient();

  const { data: balances } = await supabase
    .from('wallet_balances')
    .select('wallet_id, available_balance, currency, provider')
    .gt('available_balance', 0);

  if (!balances) {
    return { pending: 0, totalAmount: 0, byProvider: {} };
  }

  const byProvider: Record<string, { count: number; amount: number }> = {};
  let totalAmount = 0;

  for (const balance of balances) {
    totalAmount += balance.available_balance;
    
    if (!byProvider[balance.provider]) {
      byProvider[balance.provider] = { count: 0, amount: 0 };
    }
    byProvider[balance.provider].count++;
    byProvider[balance.provider].amount += balance.available_balance;
  }

  return {
    pending: balances.length,
    totalAmount,
    byProvider,
  };
}

export async function retryFailedPayouts(): Promise<BatchPayoutResult> {
  const supabase = createServiceClient();
  const results: BatchPayoutResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Get failed payouts from last 24 hours
  const { data: failedPayouts } = await supabase
    .from('payouts')
    .select('*')
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (!failedPayouts || failedPayouts.length === 0) {
    return results;
  }

  for (const payout of failedPayouts) {
    results.processed++;

    const result = await processPayout({
      walletId: payout.wallet_id,
      amount: payout.amount,
      currency: payout.currency,
      mode: 'manual',
    });

    if (result.success) {
      results.successful++;
      // Mark original as superseded
      await supabase
        .from('payouts')
        .update({ status: 'superseded' })
        .eq('id', payout.id);
    } else {
      results.failed++;
      results.errors.push({
        walletId: payout.wallet_id,
        error: result.error || 'Retry failed',
      });
    }
  }

  return results;
}
