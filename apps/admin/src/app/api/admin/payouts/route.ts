import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

async function applyWalletBalancePayout(walletId: string, amount: number, currency: string) {
  const { data: walletRow } = await supabaseAdmin
    .from('wallets')
    .select('photographer_id, provider, status')
    .eq('id', walletId)
    .maybeSingle();

  const { data: balance } = await supabaseAdmin
    .from('wallet_balances')
    .select(
      'wallet_id, photographer_id, provider, status, currency, available_balance, total_earnings, total_paid_out, pending_payout'
    )
    .eq('wallet_id', walletId)
    .maybeSingle();

  const currentAvailable = Math.max(0, Number(balance?.available_balance || 0));
  const currentEarnings = Math.max(0, Number(balance?.total_earnings || 0));
  const currentPaidOut = Math.max(0, Number(balance?.total_paid_out || 0));
  const currentPending = Math.max(0, Number(balance?.pending_payout || 0));

  const { error } = await supabaseAdmin.from('wallet_balances').upsert({
    wallet_id: walletId,
    photographer_id: balance?.photographer_id || walletRow?.photographer_id || null,
    provider: balance?.provider || walletRow?.provider || 'stripe',
    status: balance?.status || walletRow?.status || 'active',
    currency: currency || balance?.currency || 'USD',
    available_balance: Math.max(0, currentAvailable - amount),
    total_earnings: currentEarnings,
    total_paid_out: currentPaidOut + amount,
    pending_payout: Math.max(0, currentPending - amount),
  });

  if (error) throw error;
}

async function recordCompletedPayout(
  walletId: string,
  provider: string | null | undefined,
  amount: number,
  currency: string,
  payoutMethod: 'manual' | 'threshold'
) {
  const timestamp = new Date().toISOString();
  const { data: payout, error } = await supabaseAdmin
    .from('payouts')
    .insert({
      wallet_id: walletId,
      payment_provider: provider || null,
      amount,
      currency: currency || 'USD',
      status: 'completed',
      payout_method: payoutMethod,
      initiated_at: timestamp,
      completed_at: timestamp,
    })
    .select()
    .single();

  if (error) throw error;
  await applyWalletBalancePayout(walletId, amount, currency || 'USD');
  return payout;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, walletId, amount, currency } = body;

    switch (action) {
      case 'single': {
        if (!(await hasPermission('payouts.process'))) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }
        if (!walletId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
          return NextResponse.json(
            { error: 'walletId and a positive amount are required' },
            { status: 400 }
          );
        }

        const normalizedAmount = Math.round(Number(amount));
        const normalizedCurrency = String(currency || 'USD').toUpperCase();

        const { data: wallet } = await supabaseAdmin
          .from('wallets')
          .select('provider')
          .eq('id', walletId)
          .maybeSingle();

        const payout = await recordCompletedPayout(
          walletId,
          wallet?.provider,
          normalizedAmount,
          normalizedCurrency,
          'manual'
        );

        await logAction('payout_process', 'payout', payout.id, { 
          amount: normalizedAmount,
          currency: normalizedCurrency,
          walletId,
        });

        return NextResponse.json({ success: true, payout });
      }

      case 'batch-threshold': {
        if (!(await hasPermission('payouts.batch'))) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        // Get minimum thresholds
        const { data: settings } = await supabaseAdmin
          .from('platform_settings')
          .select('setting_key, value')
          .like('setting_key', 'payout_minimum_%');

        const minimums: Record<string, number> = {};
        settings?.forEach((s) => {
          const currency = s.setting_key.replace('payout_minimum_', '').toUpperCase();
          minimums[currency] = parseInt(s.value as string) || 5000;
        });

        // Get eligible balances
        const { data: eligible } = await supabaseAdmin
          .from('wallet_balances')
          .select(`
            wallet_id,
            available_balance,
            currency,
            wallets:wallet_id (
              provider
            )
          `)
          .gt('available_balance', 0);

        let processed = 0;
        for (const balance of eligible || []) {
          const minimum = minimums[balance.currency] || minimums['USD'] || 5000;
          if (balance.available_balance >= minimum) {
            const wallet = Array.isArray(balance.wallets) ? balance.wallets[0] : balance.wallets;
            await recordCompletedPayout(
              balance.wallet_id,
              wallet?.provider,
              Math.round(Number(balance.available_balance || 0)),
              String(balance.currency || 'USD').toUpperCase(),
              'threshold'
            );
            processed++;
          }
        }

        await logAction('payout_batch', 'payout', undefined, { 
          processed,
          mode: 'threshold',
        });

        return NextResponse.json({ success: true, processed });
      }

      case 'retry-failed': {
        if (!(await hasPermission('payouts.retry'))) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const { data: failed, error } = await supabaseAdmin
          .from('payouts')
          .update({ status: 'pending', failure_reason: null })
          .eq('status', 'failed')
          .gte('created_at', twentyFourHoursAgo.toISOString())
          .select();

        await logAction('payout_retry', 'payout', undefined, { 
          count: failed?.length || 0,
        });

        return NextResponse.json({ success: true, retried: failed?.length || 0 });
      }

      case 'pause': {
        if (!(await hasPermission('payouts.pause'))) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        await supabaseAdmin
          .from('platform_settings')
          .update({ value: 'false' })
          .eq('setting_key', 'payouts_enabled');

        await logAction('payout_pause', 'settings', undefined, { enabled: false });

        return NextResponse.json({ success: true });
      }

      case 'resume': {
        if (!(await hasPermission('payouts.pause'))) {
          return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
        }

        await supabaseAdmin
          .from('platform_settings')
          .update({ value: 'true' })
          .eq('setting_key', 'payouts_enabled');

        await logAction('payout_pause', 'settings', undefined, { enabled: true });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Payout action error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
