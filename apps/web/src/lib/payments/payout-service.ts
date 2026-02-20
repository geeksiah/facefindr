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

import { v4 as uuidv4 } from 'uuid';

import { createServiceClient } from '@/lib/supabase/server';

import { createMomoTransfer, isFlutterwaveConfigured } from './flutterwave';
import { createMtnDisbursementTransfer, isMtnMomoConfiguredForRegion } from './mtn-momo';
import {
  getCreatorPayoutSettings,
  areAutoPayoutsEnabled,
  PayoutFrequency,
  DEFAULT_PAYOUT_MINIMUMS,
} from './payout-config';
import {
  getProviderMinimum,
  getPlatformMinimum,
  checkPayoutEligibility,
} from './payout-minimums';

// Payout configuration
export const PAYOUT_CONFIG = {
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
  identityKey?: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  providerReference?: string;
  error?: string;
  deduped?: boolean;
}

async function applyWalletBalancePayout(
  supabase: ReturnType<typeof createServiceClient>,
  wallet: {
    id: string;
    photographer_id?: string | null;
    provider?: string | null;
    status?: string | null;
  },
  request: PayoutRequest
) {
  const { data: currentBalance } = await supabase
    .from('wallet_balances')
    .select(
      'wallet_id, photographer_id, provider, status, currency, available_balance, total_earnings, total_paid_out, pending_payout'
    )
    .eq('wallet_id', wallet.id)
    .maybeSingle();

  const currentAvailable = Math.max(0, Number(currentBalance?.available_balance || 0));
  const currentPaidOut = Math.max(0, Number(currentBalance?.total_paid_out || 0));
  const currentEarnings = Math.max(0, Number(currentBalance?.total_earnings || 0));
  const currentPending = Math.max(0, Number(currentBalance?.pending_payout || 0));

  await supabase.from('wallet_balances').upsert({
    wallet_id: wallet.id,
    photographer_id: currentBalance?.photographer_id || wallet.photographer_id || null,
    provider: currentBalance?.provider || wallet.provider || 'stripe',
    status: currentBalance?.status || wallet.status || 'active',
    currency: request.currency || currentBalance?.currency || 'USD',
    available_balance: Math.max(0, currentAvailable - Number(request.amount || 0)),
    total_earnings: currentEarnings,
    total_paid_out: currentPaidOut + Number(request.amount || 0),
    pending_payout: Math.max(0, currentPending - Number(request.amount || 0)),
  });
}

// ============================================
// MAIN PAYOUT FUNCTION
// ============================================

export async function processPayout(request: PayoutRequest): Promise<PayoutResult> {
  const supabase = createServiceClient();
  const reference = `PO-${uuidv4().slice(0, 8).toUpperCase()}`;
  const dedupeWindowStartIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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

    // Best-effort dedupe against recent equivalent payouts.
    const { data: existingPayout } = await supabase
      .from('payouts')
      .select('id, status, provider_payout_id, failure_reason')
      .eq('wallet_id', request.walletId)
      .eq('amount', request.amount)
      .eq('currency', request.currency)
      .in('status', ['pending', 'processing', 'completed'])
      .gte('created_at', dedupeWindowStartIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPayout) {
      const terminalFailure = existingPayout.status === 'failed';
      return {
        success: !terminalFailure,
        payoutId: existingPayout.id,
        providerReference: existingPayout.provider_payout_id || undefined,
        error: terminalFailure
          ? existingPayout.failure_reason || 'Payout already failed for this request'
          : undefined,
        deduped: true,
      };
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
        initiated_at: new Date().toISOString(),
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
      case 'paystack':
        // Paystack subaccounts settle via provider rails, not manual payout calls from app server.
        result = { success: true, payoutId: payout.id, providerReference: 'paystack-auto' };
        break;
      case 'paypal':
        // PayPal payouts are provider-managed once wallet is linked.
        result = { success: true, payoutId: payout.id, providerReference: 'paypal-auto' };
        break;
      default:
        result = { success: false, error: 'Unsupported provider' };
    }

    // Update payout status
    await supabase
      .from('payouts')
      .update({
        status: result.success ? 'completed' : 'failed',
        provider_payout_id: result.providerReference || reference,
        failure_reason: result.error,
        completed_at: result.success ? new Date().toISOString() : null,
      })
      .eq('id', payout.id);

    if (result.success) {
      await applyWalletBalancePayout(supabase, wallet as any, request);
    }

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
  wallet: {
    id: string;
    country_code?: string;
    momo_account_number: string;
    momo_provider: string;
    photographers: { display_name: string };
  },
  request: PayoutRequest,
  reference: string
): Promise<PayoutResult> {
  const momoProvider = String(wallet.momo_provider || '').toUpperCase();
  const countryCode = String(wallet.country_code || '').toUpperCase() || undefined;

  if (momoProvider === 'MTN' && (await isMtnMomoConfiguredForRegion(countryCode))) {
    try {
      const mtnTransfer = await createMtnDisbursementTransfer({
        regionCode: countryCode,
        referenceId: reference,
        externalId: wallet.id,
        msisdn: wallet.momo_account_number,
        amountMinor: request.amount,
        currency: request.currency,
        payerMessage: 'Creator payout',
        payeeNote: `Payout ${reference}`,
      });

      if (mtnTransfer.status === 'SUCCESSFUL' || mtnTransfer.status === 'PENDING') {
        return {
          success: true,
          providerReference: mtnTransfer.financialTransactionId || mtnTransfer.referenceId,
        };
      }

      return {
        success: false,
        error: mtnTransfer.reason || 'MTN transfer failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MTN transfer failed',
      };
    }
  }

  if (!isFlutterwaveConfigured()) {
    return { success: false, error: 'No configured MoMo payout provider for this wallet' };
  }

  try {
    const result = await createMomoTransfer({
      reference,
      amount: request.amount,
      currency: request.currency,
      phoneNumber: wallet.momo_account_number,
      network: wallet.momo_provider as 'MTN' | 'VODAFONE' | 'TIGO' | 'AIRTEL',
      beneficiaryName: wallet.photographers?.display_name || 'Ferchr Creator',
      narration: `Ferchr earnings payout - ${reference}`,
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
  runId?: string;
  runKey?: string;
  skippedReason?: string;
}

const PAYOUT_BATCH_LEASE_MS = 10 * 60 * 1000;
type BatchTriggerType = 'daily' | 'weekly' | 'monthly' | 'threshold' | 'scheduled';

interface BatchLeaseResult {
  acquired: boolean;
  runId?: string;
  runKey: string;
  skippedReason?: string;
}

function getWeeklyRunKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getBatchRunKey(triggerType: BatchTriggerType, now: Date): string {
  const iso = now.toISOString();
  switch (triggerType) {
    case 'daily':
      return iso.slice(0, 10);
    case 'weekly':
      return getWeeklyRunKey(now);
    case 'monthly':
      return iso.slice(0, 7);
    case 'threshold':
      return iso.slice(0, 13); // hourly bucket
    case 'scheduled':
      return iso.slice(0, 13); // hourly bucket for manual scheduled batches
    default:
      return iso.slice(0, 13);
  }
}

async function acquireBatchLease(
  triggerType: BatchTriggerType,
  now: Date
): Promise<BatchLeaseResult> {
  const supabase = createServiceClient();
  const runKey = getBatchRunKey(triggerType, now);
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + PAYOUT_BATCH_LEASE_MS).toISOString();

  const { data: createdRun, error: createRunError } = await supabase
    .from('payout_batch_runs')
    .insert({
      run_type: triggerType,
      run_key: runKey,
      status: 'processing',
      lease_expires_at: leaseExpiresAt,
      metadata: {
        triggerType,
        startedAt: nowIso,
        leaseMs: PAYOUT_BATCH_LEASE_MS,
      },
    })
    .select('id')
    .single();

  if (!createRunError && createdRun?.id) {
    return { acquired: true, runId: createdRun.id, runKey };
  }

  if (createRunError?.code !== '23505') {
    throw createRunError;
  }

  const { data: existingRun, error: existingRunError } = await supabase
    .from('payout_batch_runs')
    .select('id, status, lease_expires_at')
    .eq('run_type', triggerType)
    .eq('run_key', runKey)
    .single();

  if (existingRunError || !existingRun) {
    throw existingRunError || new Error('Unable to resolve existing payout batch run');
  }

  if (existingRun.status === 'completed' || existingRun.status === 'failed') {
    return {
      acquired: false,
      runId: existingRun.id,
      runKey,
      skippedReason: 'batch-already-finalized',
    };
  }

  if (new Date(existingRun.lease_expires_at).getTime() > now.getTime()) {
    return {
      acquired: false,
      runId: existingRun.id,
      runKey,
      skippedReason: 'batch-lease-active',
    };
  }

  const { data: reclaimedRun } = await supabase
    .from('payout_batch_runs')
    .update({
      status: 'processing',
      lease_expires_at: leaseExpiresAt,
      completed_at: null,
      metadata: {
        triggerType,
        reclaimedAt: nowIso,
        leaseMs: PAYOUT_BATCH_LEASE_MS,
      },
    })
    .eq('id', existingRun.id)
    .lte('lease_expires_at', nowIso)
    .select('id')
    .maybeSingle();

  if (reclaimedRun?.id) {
    return { acquired: true, runId: reclaimedRun.id, runKey };
  }

  return {
    acquired: false,
    runId: existingRun.id,
    runKey,
    skippedReason: 'batch-lease-raced',
  };
}

async function finalizeBatchLease(
  runId: string,
  status: 'completed' | 'failed',
  summary: BatchPayoutResult,
  triggerType: BatchTriggerType
): Promise<void> {
  const supabase = createServiceClient();
  const finalizedAt = new Date().toISOString();

  await supabase
    .from('payout_batch_runs')
    .update({
      status,
      completed_at: finalizedAt,
      lease_expires_at: finalizedAt,
      metadata: {
        triggerType,
        finalizedAt,
        processed: summary.processed,
        successful: summary.successful,
        failed: summary.failed,
        errors: summary.errors,
      },
    })
    .eq('id', runId);
}

export async function processPendingPayouts(
  triggerType: BatchTriggerType
): Promise<BatchPayoutResult> {
  const supabase = createServiceClient();
  const results: BatchPayoutResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Check if auto-payouts are enabled globally
  const autoPayoutsEnabled = await areAutoPayoutsEnabled();
  if (!autoPayoutsEnabled) {
    console.log('[PAYOUT] Auto-payouts disabled globally');
    return results;
  }

  let lease: BatchLeaseResult | null = null;
  let finalizeStatus: 'completed' | 'failed' = 'completed';

  try {
    lease = await acquireBatchLease(triggerType, new Date());
    results.runId = lease.runId;
    results.runKey = lease.runKey;

    if (!lease.acquired) {
      results.skippedReason = lease.skippedReason || 'batch-lease-not-acquired';
      console.log(`[PAYOUT] Skipping ${triggerType} run (${results.runKey}): ${results.skippedReason}`);
      return results;
    }

    // Get all wallets with pending balances and their photographer settings
    const { data: wallets } = await supabase
      .from('wallets')
      .select(`
        id,
        photographer_id,
        provider,
        momo_provider,
        preferred_currency,
        payout_settings:photographer_id (
          payout_frequency,
          weekly_payout_day,
          monthly_payout_day,
          auto_payout_enabled
        )
      `)
      .eq('status', 'active')
      .eq('payouts_enabled', true);

    if (!wallets || wallets.length === 0) {
      return results;
    }

    // Get current day info for schedule matching
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 1-7 (Monday=1, Sunday=7)
    const dayOfMonth = now.getDate();

    for (const wallet of wallets) {
      const settings = wallet.payout_settings?.[0] || null;
      const frequency: PayoutFrequency = settings?.payout_frequency || 'weekly';
      
      // Skip if photographer disabled auto-payouts
      if (settings && settings.auto_payout_enabled === false) {
        continue;
      }

      // Check if this wallet should be processed based on frequency
      let shouldProcess = false;

      switch (triggerType) {
        case 'daily':
          shouldProcess = frequency === 'daily';
          break;
        case 'weekly':
          shouldProcess = frequency === 'weekly' && 
            dayOfWeek === (settings?.weekly_payout_day || 1);
          break;
        case 'monthly':
          shouldProcess = frequency === 'monthly' && 
            dayOfMonth === (settings?.monthly_payout_day || 1);
          break;
        case 'threshold':
          // Threshold payouts apply to everyone (as a fallback)
          shouldProcess = true;
          break;
        case 'scheduled':
          // Manual admin batch for all scheduled users (ignore day matching)
          shouldProcess = frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly';
          break;
      }

      if (!shouldProcess) {
        continue;
      }

      // Get balance for this wallet
      const { data: balanceData } = await supabase
        .from('wallet_balances')
        .select('available_balance, currency')
        .eq('wallet_id', wallet.id)
        .single();

      if (!balanceData || balanceData.available_balance <= 0) {
        continue;
      }

      // Get currency and provider method
      const currency = balanceData.currency || wallet.preferred_currency || 'USD';
      const provider = wallet.provider || 'stripe';
      const method = wallet.momo_provider || 'bank';
      
      // Check eligibility using two-tier minimum system
      const isScheduled = triggerType !== 'threshold';
      const eligibility = checkPayoutEligibility(
        balanceData.available_balance,
        currency,
        provider,
        method,
        isScheduled
      );

      if (!eligibility.canPayout) {
        // Skip if not eligible
        continue;
      }

      results.processed++;

      const result = await processPayout({
        walletId: wallet.id,
        amount: balanceData.available_balance,
        currency,
        mode: triggerType === 'threshold' ? 'threshold' : 'scheduled',
        identityKey: `batch:${triggerType}:${lease.runKey}:wallet:${wallet.id}`,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push({
          walletId: wallet.id,
          error: result.error || 'Unknown error',
        });
      }
    }

    return results;
  } catch (error) {
    finalizeStatus = 'failed';
    console.error('Batch payout error:', error);
    return results;
  } finally {
    if (lease?.acquired && lease.runId) {
      await finalizeBatchLease(lease.runId, finalizeStatus, results, triggerType);
    }
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
  threshold: DEFAULT_PAYOUT_MINIMUMS.USD,
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
      identityKey: `retry:${payout.id}`,
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
