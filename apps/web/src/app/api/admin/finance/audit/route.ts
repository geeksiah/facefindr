export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { isFinancialLedgerShadowWriteEnabled } from '@/lib/payments/financial-ledger';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type Severity = 'critical' | 'error' | 'warning' | 'info';

interface AuditIssue {
  code: string;
  severity: Severity;
  count: number;
  summary: string;
  sample: Array<Record<string, unknown>>;
}

function toInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function toMinor(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  const relation = relationName.toLowerCase();
  return (
    code === '42P01' ||
    (code.startsWith('PGRST') && message.includes('schema cache') && message.includes('table')) ||
    message.includes(`relation "${relation}" does not exist`) ||
    message.includes(relation)
  );
}

async function isAdmin(supabase: any, user: { email?: string | null }) {
  if (!user.email) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(data?.id);
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function pushIssue(
  issues: AuditIssue[],
  input: {
    code: string;
    severity: Severity;
    summary: string;
    rows: Array<Record<string, unknown>>;
    sampleLimit: number;
  }
) {
  if (!input.rows.length) return;
  issues.push({
    code: input.code,
    severity: input.severity,
    count: input.rows.length,
    summary: input.summary,
    sample: input.rows.slice(0, input.sampleLimit),
  });
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || !(await isAdmin(authClient, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lookbackDays = toInt(searchParams.get('lookbackDays'), 90, 1, 3650);
    const transactionLimit = toInt(searchParams.get('transactionLimit'), 5000, 50, 20000);
    const payoutLimit = toInt(searchParams.get('payoutLimit'), 5000, 50, 20000);
    const ledgerLimit = toInt(searchParams.get('ledgerLimit'), 20000, 500, 100000);
    const sampleLimit = toInt(searchParams.get('sampleLimit'), 50, 5, 200);

    const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    const supabase = createServiceClient();
    const ledgerShadowEnabled = isFinancialLedgerShadowWriteEnabled();

    const issues: AuditIssue[] = [];
    const warnings: string[] = [];

    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select(
        'id, wallet_id, status, currency, gross_amount, platform_fee, provider_fee, stripe_fee, net_amount, metadata, created_at, updated_at'
      )
      .in('status', ['succeeded', 'refunded'])
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(transactionLimit);

    if (txError) {
      throw txError;
    }

    const { data: payouts, error: payoutError } = await supabase
      .from('payouts')
      .select('id, wallet_id, status, amount, currency, payment_provider, initiated_at, completed_at')
      .in('status', ['pending', 'completed'])
      .gte('initiated_at', sinceIso)
      .order('initiated_at', { ascending: false })
      .limit(payoutLimit);
    if (payoutError) {
      throw payoutError;
    }

    const walletIds = Array.from(
      new Set(
        [
          ...(transactions || []).map((row: any) => String(row.wallet_id || '').trim()),
          ...(payouts || []).map((row: any) => String(row.wallet_id || '').trim()),
        ].filter(Boolean)
      )
    );

    const walletsById = new Map<string, any>();
    if (walletIds.length > 0) {
      const { data: wallets } = await supabase
        .from('wallets')
        .select('id, photographer_id, preferred_currency, provider, status')
        .in('id', walletIds);
      for (const wallet of wallets || []) {
        walletsById.set(String(wallet.id), wallet);
      }
    }

    const arithmeticMismatches: Array<Record<string, unknown>> = [];
    const txNetByWallet = new Map<string, number>();
    for (const tx of transactions || []) {
      const providerFee = toMinor(
        tx.provider_fee !== null && tx.provider_fee !== undefined ? tx.provider_fee : tx.stripe_fee
      );
      const gross = toMinor(tx.gross_amount);
      const platform = toMinor(tx.platform_fee);
      const net = toMinor(tx.net_amount);
      const expectedNet = gross - platform - providerFee;
      if (expectedNet !== net) {
        arithmeticMismatches.push({
          transaction_id: tx.id,
          gross_amount: gross,
          platform_fee: platform,
          provider_fee: providerFee,
          net_amount: net,
          expected_net_amount: expectedNet,
          currency: tx.currency,
          status: tx.status,
        });
      }

      if (String(tx.status).toLowerCase() === 'succeeded') {
        const walletId = String(tx.wallet_id || '').trim();
        if (walletId) {
          txNetByWallet.set(walletId, (txNetByWallet.get(walletId) || 0) + net);
        }
      }
    }

    pushIssue(issues, {
      code: 'transaction_net_amount_mismatch',
      severity: 'critical',
      summary: 'Transactions where gross != platform + provider + net.',
      rows: arithmeticMismatches,
      sampleLimit,
    });

    const payoutCompletedByWallet = new Map<string, number>();
    const payoutPendingByWallet = new Map<string, number>();
    for (const payout of payouts || []) {
      const walletId = String(payout.wallet_id || '').trim();
      if (!walletId) continue;
      const amount = toMinor(payout.amount);
      if (String(payout.status).toLowerCase() === 'completed') {
        payoutCompletedByWallet.set(walletId, (payoutCompletedByWallet.get(walletId) || 0) + amount);
      } else if (String(payout.status).toLowerCase() === 'pending') {
        payoutPendingByWallet.set(walletId, (payoutPendingByWallet.get(walletId) || 0) + amount);
      }
    }

    let walletBalanceRows: any[] = [];
    const { data: walletBalances, error: walletBalanceError } = await supabase
      .from('wallet_balances')
      .select('wallet_id, photographer_id, currency, total_earnings, total_paid_out, available_balance, pending_payout')
      .in('wallet_id', walletIds.length ? walletIds : ['00000000-0000-0000-0000-000000000000']);

    if (walletBalanceError) {
      if (isMissingRelationError(walletBalanceError, 'wallet_balances')) {
        warnings.push('wallet_balances relation is unavailable; wallet view consistency checks skipped.');
      } else {
        throw walletBalanceError;
      }
    } else {
      walletBalanceRows = walletBalances || [];
    }

    if (walletBalanceRows.length > 0) {
      const walletViewMismatches: Array<Record<string, unknown>> = [];
      for (const wb of walletBalanceRows) {
        const walletId = String(wb.wallet_id || '').trim();
        const expectedTotalEarnings = txNetByWallet.get(walletId) || 0;
        const expectedPaidOut = payoutCompletedByWallet.get(walletId) || 0;
        const expectedPending = payoutPendingByWallet.get(walletId) || 0;
        const expectedAvailable = expectedTotalEarnings - expectedPaidOut;

        const actualTotalEarnings = toMinor(wb.total_earnings);
        const actualPaidOut = toMinor(wb.total_paid_out);
        const actualPending = toMinor(wb.pending_payout);
        const actualAvailable = toMinor(wb.available_balance);

        if (
          expectedTotalEarnings !== actualTotalEarnings ||
          expectedPaidOut !== actualPaidOut ||
          expectedPending !== actualPending ||
          expectedAvailable !== actualAvailable
        ) {
          walletViewMismatches.push({
            wallet_id: walletId,
            photographer_id: wb.photographer_id,
            currency: wb.currency,
            expected_total_earnings: expectedTotalEarnings,
            actual_total_earnings: actualTotalEarnings,
            expected_total_paid_out: expectedPaidOut,
            actual_total_paid_out: actualPaidOut,
            expected_pending_payout: expectedPending,
            actual_pending_payout: actualPending,
            expected_available_balance: expectedAvailable,
            actual_available_balance: actualAvailable,
          });
        }
      }

      pushIssue(issues, {
        code: 'wallet_balance_view_mismatch',
        severity: 'error',
        summary: 'wallet_balances values diverge from transactions/payouts aggregates.',
        rows: walletViewMismatches,
        sampleLimit,
      });
    }

    if (!ledgerShadowEnabled) {
      warnings.push(
        'FINANCIAL_LEDGER_SHADOW_WRITES is disabled; ledger coverage checks may under-report true payment activity.'
      );
    }

    if (ledgerShadowEnabled) {
      const { data: journals, error: journalError } = await supabase
        .from('financial_journals')
        .select('id, source_kind, source_id, flow_type, provider, currency, metadata, occurred_at')
        .gte('occurred_at', sinceIso)
        .order('occurred_at', { ascending: false })
        .limit(ledgerLimit);

      if (journalError) {
        if (isMissingRelationError(journalError, 'financial_journals')) {
          warnings.push('financial_journals relation is unavailable; ledger checks skipped.');
        } else {
          throw journalError;
        }
      } else {
        if ((journals || []).length >= ledgerLimit) {
          warnings.push(
            `Ledger rows hit limit (${ledgerLimit}); increase ledgerLimit for complete coverage.`
          );
        }

        const journalIds = (journals || []).map((row: any) => String(row.id));
        const postings: any[] = [];
        for (const ids of chunk(journalIds, 1000)) {
          const { data: chunkRows, error: postingsError } = await supabase
            .from('financial_postings')
            .select('journal_id, account_code, direction, amount_minor, currency, counterparty_type, counterparty_id')
            .in('journal_id', ids);
          if (postingsError) {
            throw postingsError;
          }
          postings.push(...(chunkRows || []));
        }

        const txIds = new Set<string>((transactions || []).map((tx: any) => String(tx.id)));
        const refundedTxIds = new Set<string>(
          (transactions || [])
            .filter((tx: any) => String(tx.status).toLowerCase() === 'refunded')
            .map((tx: any) => String(tx.id))
        );
        const completedPayoutIds = new Set<string>(
          (payouts || [])
            .filter((p: any) => String(p.status).toLowerCase() === 'completed')
            .map((p: any) => String(p.id))
        );

        const settlementTxWithJournal = new Set<string>();
        const refundTxWithJournal = new Set<string>();
        const payoutWithJournal = new Set<string>();
        const journalMetaById = new Map<string, any>();
        for (const journal of journals || []) {
          journalMetaById.set(String(journal.id), journal);
          const sourceKind = String(journal.source_kind || '').toLowerCase();
          const flowType = String(journal.flow_type || '').toLowerCase();
          const sourceId = String(journal.source_id || '');
          const metadata = (journal.metadata || {}) as Record<string, unknown>;
          const metadataTxId = String(metadata.transaction_id || '').trim();

          if ((flowType === 'photo_purchase' || flowType === 'tip') && sourceKind === 'transaction' && txIds.has(sourceId)) {
            settlementTxWithJournal.add(sourceId);
          }
          if ((flowType === 'photo_purchase' || flowType === 'tip') && metadataTxId && txIds.has(metadataTxId)) {
            settlementTxWithJournal.add(metadataTxId);
          }
          if (flowType === 'refund' && sourceKind === 'transaction' && refundedTxIds.has(sourceId)) {
            refundTxWithJournal.add(sourceId);
          }
          if (flowType === 'refund' && metadataTxId && refundedTxIds.has(metadataTxId)) {
            refundTxWithJournal.add(metadataTxId);
          }
          if (flowType === 'payout' && sourceKind === 'payout' && completedPayoutIds.has(sourceId)) {
            payoutWithJournal.add(sourceId);
          }
        }

        const missingSettlementRows = (transactions || [])
          .filter((tx: any) => String(tx.status).toLowerCase() === 'succeeded')
          .filter((tx: any) => !settlementTxWithJournal.has(String(tx.id)))
          .map((tx: any) => ({
            transaction_id: tx.id,
            wallet_id: tx.wallet_id,
            currency: tx.currency,
            net_amount: toMinor(tx.net_amount),
            created_at: tx.created_at,
          }));

        pushIssue(issues, {
          code: 'missing_transaction_settlement_journal',
          severity: 'critical',
          summary: 'Succeeded transactions missing settlement journals.',
          rows: missingSettlementRows,
          sampleLimit,
        });

        const missingRefundRows = Array.from(refundedTxIds)
          .filter((txId) => !refundTxWithJournal.has(txId))
          .map((txId) => ({ transaction_id: txId }));

        pushIssue(issues, {
          code: 'missing_transaction_refund_journal',
          severity: 'error',
          summary: 'Refunded transactions missing refund journals.',
          rows: missingRefundRows,
          sampleLimit,
        });

        const missingPayoutRows = Array.from(completedPayoutIds)
          .filter((payoutId) => !payoutWithJournal.has(payoutId))
          .map((payoutId) => ({ payout_id: payoutId }));

        pushIssue(issues, {
          code: 'missing_payout_journal',
          severity: 'critical',
          summary: 'Completed payouts missing payout journals.',
          rows: missingPayoutRows,
          sampleLimit,
        });

        const postingSums = new Map<string, { debit: number; credit: number }>();
        for (const posting of postings) {
          const journalId = String(posting.journal_id || '');
          if (!journalId) continue;
          const amount = Math.max(0, toMinor(posting.amount_minor));
          const direction = String(posting.direction || '').toLowerCase();
          const agg = postingSums.get(journalId) || { debit: 0, credit: 0 };
          if (direction === 'debit') {
            agg.debit += amount;
          } else if (direction === 'credit') {
            agg.credit += amount;
          }
          postingSums.set(journalId, agg);
        }

        const unbalancedRows: Array<Record<string, unknown>> = [];
        for (const [journalId, totals] of postingSums.entries()) {
          if (totals.debit !== totals.credit) {
            const journal = journalMetaById.get(journalId);
            unbalancedRows.push({
              journal_id: journalId,
              source_kind: journal?.source_kind || null,
              source_id: journal?.source_id || null,
              flow_type: journal?.flow_type || null,
              debit_minor: totals.debit,
              credit_minor: totals.credit,
              delta_minor: totals.debit - totals.credit,
            });
          }
        }

        pushIssue(issues, {
          code: 'unbalanced_financial_journal',
          severity: 'critical',
          summary: 'Financial journals with debit/credit imbalance.',
          rows: unbalancedRows,
          sampleLimit,
        });

        const creatorSettleRows: any[] = [];
        const { data: creatorSettlement, error: creatorSettlementError } = await supabase
          .from('financial_creator_settlement_view')
          .select('creator_id, currency, creator_payable_outstanding_minor');
        if (creatorSettlementError) {
          if (isMissingRelationError(creatorSettlementError, 'financial_creator_settlement_view')) {
            warnings.push('financial_creator_settlement_view is unavailable; ledger-vs-wallet payable checks skipped.');
          } else {
            throw creatorSettlementError;
          }
        } else {
          creatorSettleRows.push(...(creatorSettlement || []));
        }

        if (walletBalanceRows.length > 0 && creatorSettleRows.length > 0) {
          const payableByCreatorCurrency = new Map<string, number>();
          for (const row of creatorSettleRows) {
            const key = `${String(row.creator_id)}:${String(row.currency || 'USD').toUpperCase()}`;
            payableByCreatorCurrency.set(key, toMinor(row.creator_payable_outstanding_minor));
          }

          const ledgerWalletDriftRows: Array<Record<string, unknown>> = [];
          for (const walletBalance of walletBalanceRows) {
            const creatorId = String(walletBalance.photographer_id || '');
            const currency = String(walletBalance.currency || 'USD').toUpperCase();
            const key = `${creatorId}:${currency}`;
            const ledgerOutstanding = payableByCreatorCurrency.get(key) || 0;
            const walletAvailable = toMinor(walletBalance.available_balance);
            if (ledgerOutstanding !== walletAvailable) {
              ledgerWalletDriftRows.push({
                wallet_id: walletBalance.wallet_id,
                creator_id: creatorId,
                currency,
                wallet_available_balance: walletAvailable,
                ledger_creator_payable_outstanding: ledgerOutstanding,
                delta_minor: walletAvailable - ledgerOutstanding,
              });
            }
          }

          pushIssue(issues, {
            code: 'wallet_vs_ledger_creator_payable_mismatch',
            severity: 'error',
            summary: 'Wallet available balance diverges from ledger creator payable outstanding.',
            rows: ledgerWalletDriftRows,
            sampleLimit,
          });
        }
      }
    }

    // Notification integrity checks (idempotency + policy compliance).
    let notificationsAudited = 0;
    try {
      const { data: notificationRows, error: notificationError } = await supabase
        .from('notifications')
        .select('id, user_id, template_code, category, dedupe_key, is_hidden, created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50000);

      if (notificationError) {
        warnings.push(`Notification integrity checks skipped: ${notificationError.message}`);
      } else {
        const rows = notificationRows || [];
        notificationsAudited = rows.length;

        const dedupeVisibleCounts = new Map<string, number>();
        for (const row of rows) {
          const dedupeKey = String((row as any).dedupe_key || '').trim();
          if (!dedupeKey || (row as any).is_hidden === true) continue;
          const key = `${String((row as any).user_id)}|${dedupeKey}`;
          dedupeVisibleCounts.set(key, (dedupeVisibleCounts.get(key) || 0) + 1);
        }

        const duplicateVisibleRows = Array.from(dedupeVisibleCounts.entries())
          .filter(([, count]) => count > 1)
          .map(([key, count]) => {
            const [userId, dedupeKey] = key.split('|', 2);
            return { user_id: userId, dedupe_key: dedupeKey, visible_count: count };
          });

        pushIssue(issues, {
          code: 'notification_visible_duplicate_dedupe_key',
          severity: 'critical',
          summary: 'Visible notifications contain duplicate (user_id, dedupe_key) keys.',
          rows: duplicateVisibleRows,
          sampleLimit,
        });

        const unfollowVisibleRows = rows
          .filter((row: any) => row.template_code === 'social_follower_removed' && row.is_hidden !== true)
          .map((row: any) => ({ id: row.id, user_id: row.user_id, created_at: row.created_at }));

        pushIssue(issues, {
          code: 'notification_visible_unfollow',
          severity: 'error',
          summary: 'Unfollow notifications are visible but must be hidden by policy.',
          rows: unfollowVisibleRows,
          sampleLimit,
        });

        const unknownCategoryRows = rows
          .filter((row: any) =>
            !['transactions', 'photos', 'orders', 'social', 'system', 'marketing'].includes(
              String(row.category || '')
            )
          )
          .map((row: any) => ({
            id: row.id,
            template_code: row.template_code,
            category: row.category,
          }));

        pushIssue(issues, {
          code: 'notification_unknown_category',
          severity: 'warning',
          summary: 'Notifications with unknown/missing category values.',
          rows: unknownCategoryRows,
          sampleLimit,
        });
      }
    } catch (notificationAuditError: any) {
      warnings.push(`Notification integrity checks failed: ${notificationAuditError?.message || 'unknown error'}`);
    }

    const severityOrder: Record<Severity, number> = {
      critical: 4,
      error: 3,
      warning: 2,
      info: 1,
    };
    const orderedIssues = [...issues].sort((a, b) => {
      const severityDelta = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return b.count - a.count;
    });

    const totals = {
      critical: orderedIssues.filter((i) => i.severity === 'critical').reduce((acc, i) => acc + i.count, 0),
      error: orderedIssues.filter((i) => i.severity === 'error').reduce((acc, i) => acc + i.count, 0),
      warning: orderedIssues.filter((i) => i.severity === 'warning').reduce((acc, i) => acc + i.count, 0),
      info: orderedIssues.filter((i) => i.severity === 'info').reduce((acc, i) => acc + i.count, 0),
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      parameters: {
        lookbackDays,
        transactionLimit,
        payoutLimit,
        ledgerLimit,
        sampleLimit,
      },
      coverage: {
        transactionsAudited: (transactions || []).length,
        payoutsAudited: (payouts || []).length,
        walletsAudited: walletIds.length,
        notificationsAudited,
        ledgerShadowWritesEnabled: ledgerShadowEnabled,
      },
      totals,
      issues: orderedIssues,
      warnings,
      pass: totals.critical === 0 && totals.error === 0,
    });
  } catch (error) {
    console.error('Admin finance audit GET error:', error);
    return NextResponse.json(
      { error: 'Failed to run finance audit' },
      { status: 500 }
    );
  }
}
