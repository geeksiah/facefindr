import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

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

        // Create payout record
        const { data: payout, error } = await supabaseAdmin
          .from('payouts')
          .insert({
            wallet_id: walletId,
            amount,
            currency: currency || 'USD',
            status: 'pending',
            mode: 'manual',
          })
          .select()
          .single();

        if (error) throw error;

        // Update wallet balance
        await supabaseAdmin.rpc('decrement_wallet_balance', {
          p_wallet_id: walletId,
          p_amount: amount,
        });

        await logAction('payout_process', 'payout', payout.id, { 
          amount, 
          currency,
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
          .select('wallet_id, available_balance, currency')
          .gt('available_balance', 0);

        let processed = 0;
        for (const balance of eligible || []) {
          const minimum = minimums[balance.currency] || minimums['USD'] || 5000;
          if (balance.available_balance >= minimum) {
            await supabaseAdmin.from('payouts').insert({
              wallet_id: balance.wallet_id,
              amount: balance.available_balance,
              currency: balance.currency,
              status: 'pending',
              mode: 'threshold',
            });
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
          .eq('key', 'payouts_enabled');

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
          .eq('key', 'payouts_enabled');

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
