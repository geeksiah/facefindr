export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  recordDropInCreditPurchaseJournal,
  recordRefundJournalForTransaction,
  recordSettlementJournalForTransaction,
} from '@/lib/payments/financial-flow-ledger';
import { recordFinancialJournal } from '@/lib/payments/financial-ledger';
import { createServiceClient } from '@/lib/supabase/server';

const CRON_SECRET = process.env.CRON_SECRET;

interface ReconcileIssueInput {
  runId: string;
  issueKey: string;
  issueType: string;
  sourceKind: string;
  sourceId: string;
  severity?: 'warning' | 'error' | 'critical' | 'info';
  details?: Record<string, unknown>;
  autoHealed?: boolean;
  resolved?: boolean;
}

async function hasSettlementJournalForTransaction(supabase: ReturnType<typeof createServiceClient>, transactionId: string) {
  const direct = await supabase
    .from('financial_journals')
    .select('id')
    .eq('source_kind', 'transaction')
    .eq('source_id', transactionId)
    .in('flow_type', ['photo_purchase', 'tip'])
    .limit(1)
    .maybeSingle();
  if (direct.data?.id) return true;

  const byMetadata = await supabase
    .from('financial_journals')
    .select('id')
    .contains('metadata', { transaction_id: transactionId })
    .in('flow_type', ['photo_purchase', 'tip'])
    .limit(1)
    .maybeSingle();

  return Boolean(byMetadata.data?.id);
}

async function hasRefundJournalForTransaction(supabase: ReturnType<typeof createServiceClient>, transactionId: string) {
  const direct = await supabase
    .from('financial_journals')
    .select('id')
    .eq('source_kind', 'transaction')
    .eq('source_id', transactionId)
    .eq('flow_type', 'refund')
    .limit(1)
    .maybeSingle();
  if (direct.data?.id) return true;

  const byMetadata = await supabase
    .from('financial_journals')
    .select('id')
    .contains('metadata', { transaction_id: transactionId })
    .eq('flow_type', 'refund')
    .limit(1)
    .maybeSingle();

  return Boolean(byMetadata.data?.id);
}

async function upsertReconciliationIssue(
  supabase: ReturnType<typeof createServiceClient>,
  input: ReconcileIssueInput
) {
  const now = new Date().toISOString();
  await supabase
    .from('financial_reconciliation_issues')
    .upsert(
      {
        run_id: input.runId,
        issue_key: input.issueKey,
        issue_type: input.issueType,
        severity: input.severity || 'error',
        source_kind: input.sourceKind,
        source_id: input.sourceId,
        status: input.resolved ? 'resolved' : 'open',
        auto_healed: Boolean(input.autoHealed),
        resolved_at: input.resolved ? now : null,
        details: input.details || {},
        updated_at: now,
      },
      { onConflict: 'issue_key' }
    );
}

export async function POST(request: Request) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured. Endpoint is disabled.' },
        { status: 503 }
      );
    }

    const headersList = await headers();
    const authHeader = headersList.get('authorization');

    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 1000);
    const dryRun = String(searchParams.get('dryRun') || '').toLowerCase() === 'true';

    const supabase = createServiceClient();
    const runKey = `finance-reconcile:${new Date().toISOString()}:${Math.random().toString(36).slice(2, 8)}`;

    const { data: run, error: runError } = await supabase
      .from('financial_reconciliation_runs')
      .insert({
        run_key: runKey,
        trigger_source: 'cron',
        status: 'processing',
        metadata: {
          dryRun,
          limit,
        },
      })
      .select('id')
      .single();

    if (runError || !run?.id) {
      return NextResponse.json(
        {
          error: 'Financial reconciliation tables are not available yet',
          details: runError?.message || null,
        },
        { status: 503 }
      );
    }

    const runId = run.id;
    let checked = 0;
    let issues = 0;
    let autoHealed = 0;

    const { data: succeededTransactions } = await supabase
      .from('transactions')
      .select('id, metadata')
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false })
      .limit(limit);

    for (const tx of succeededTransactions || []) {
      checked += 1;
      const hasJournal = await hasSettlementJournalForTransaction(supabase, tx.id);
      if (hasJournal) continue;

      const metadata = (tx.metadata || {}) as Record<string, unknown>;
      const tipId = typeof metadata.tip_id === 'string' ? metadata.tip_id : null;
      const flowType = tipId ? 'tip' : 'photo_purchase';

      if (!dryRun) {
        await recordSettlementJournalForTransaction(supabase, {
          transactionId: tx.id,
          flowType,
          sourceKind: tipId ? 'tip' : 'transaction',
          sourceId: tipId || tx.id,
          description: 'Auto-healed missing settlement journal from reconciliation',
          metadata: {
            reconcile_run_id: runId,
            auto_healed: true,
          },
        }).catch(() => {
          // Reconciliation will keep issue open if heal fails.
        });
      }

      const healed = !dryRun && (await hasSettlementJournalForTransaction(supabase, tx.id));
      await upsertReconciliationIssue(supabase, {
        runId,
        issueKey: `missing_settlement_journal:transaction:${tx.id}`,
        issueType: 'missing_settlement_journal',
        sourceKind: 'transaction',
        sourceId: tx.id,
        severity: 'error',
        autoHealed: healed,
        resolved: healed,
        details: {
          transaction_id: tx.id,
          flow_type: flowType,
          dry_run: dryRun,
        },
      });

      issues += 1;
      if (healed) autoHealed += 1;
    }

    const { data: refundedTransactions } = await supabase
      .from('transactions')
      .select('id, metadata')
      .eq('status', 'refunded')
      .order('updated_at', { ascending: false })
      .limit(limit);

    for (const tx of refundedTransactions || []) {
      checked += 1;
      const hasRefund = await hasRefundJournalForTransaction(supabase, tx.id);
      if (hasRefund) continue;

      const metadata = (tx.metadata || {}) as Record<string, unknown>;
      const tipId = typeof metadata.tip_id === 'string' ? metadata.tip_id : null;

      if (!dryRun) {
        await recordRefundJournalForTransaction(supabase, {
          transactionId: tx.id,
          sourceKind: tipId ? 'tip' : 'transaction',
          sourceId: tipId || tx.id,
          description: 'Auto-healed missing refund journal from reconciliation',
          metadata: {
            reconcile_run_id: runId,
            auto_healed: true,
          },
        }).catch(() => {
          // Reconciliation will keep issue open if heal fails.
        });
      }

      const healed = !dryRun && (await hasRefundJournalForTransaction(supabase, tx.id));
      await upsertReconciliationIssue(supabase, {
        runId,
        issueKey: `missing_refund_journal:transaction:${tx.id}`,
        issueType: 'missing_refund_journal',
        sourceKind: 'transaction',
        sourceId: tx.id,
        severity: 'warning',
        autoHealed: healed,
        resolved: healed,
        details: {
          transaction_id: tx.id,
          dry_run: dryRun,
        },
      });

      issues += 1;
      if (healed) autoHealed += 1;
    }

    const { data: creditPurchases } = await supabase
      .from('drop_in_credit_purchases')
      .select('id, attendee_id, amount_paid, currency, status, payment_intent_id')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(limit);

    for (const purchase of creditPurchases || []) {
      checked += 1;
      const { data: existingJournal } = await supabase
        .from('financial_journals')
        .select('id')
        .eq('source_kind', 'drop_in_credit_purchase')
        .eq('source_id', purchase.id)
        .eq('flow_type', 'drop_in_credit_purchase')
        .limit(1)
        .maybeSingle();

      if (existingJournal?.id) continue;

      if (!dryRun) {
        await recordDropInCreditPurchaseJournal(supabase, {
          purchaseId: purchase.id,
          attendeeId: purchase.attendee_id,
          amountMinor: Math.max(0, Math.round(Number(purchase.amount_paid || 0))),
          currency: String(purchase.currency || 'USD').toUpperCase(),
          provider: 'unknown',
          metadata: {
            reconcile_run_id: runId,
            payment_intent_id: purchase.payment_intent_id || null,
            auto_healed: true,
          },
        }).catch(() => {
          // Reconciliation will keep issue open if heal fails.
        });
      }

      const { data: healedJournal } = await supabase
        .from('financial_journals')
        .select('id')
        .eq('source_kind', 'drop_in_credit_purchase')
        .eq('source_id', purchase.id)
        .eq('flow_type', 'drop_in_credit_purchase')
        .limit(1)
        .maybeSingle();

      const healed = !dryRun && Boolean(healedJournal?.id);
      await upsertReconciliationIssue(supabase, {
        runId,
        issueKey: `missing_dropin_purchase_journal:drop_in_credit_purchase:${purchase.id}`,
        issueType: 'missing_dropin_purchase_journal',
        sourceKind: 'drop_in_credit_purchase',
        sourceId: purchase.id,
        severity: 'error',
        autoHealed: healed,
        resolved: healed,
        details: {
          purchase_id: purchase.id,
          dry_run: dryRun,
        },
      });

      issues += 1;
      if (healed) autoHealed += 1;
    }

    const { data: payouts } = await supabase
      .from('payouts')
      .select('id, wallet_id, amount, currency, payment_provider, status, wallets(photographer_id)')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(limit);

    for (const payout of payouts || []) {
      checked += 1;
      const { data: existingJournal } = await supabase
        .from('financial_journals')
        .select('id')
        .eq('source_kind', 'payout')
        .eq('source_id', payout.id)
        .eq('flow_type', 'payout')
        .limit(1)
        .maybeSingle();

      if (existingJournal?.id) continue;

      if (!dryRun) {
        await recordFinancialJournal(supabase, {
          idempotencyKey: `ledger:payout:${payout.id}:reconcile`,
          sourceKind: 'payout',
          sourceId: payout.id,
          flowType: 'payout',
          currency: String(payout.currency || 'USD').toUpperCase(),
          provider: payout.payment_provider || null,
          description: 'Auto-healed missing payout journal from reconciliation',
          metadata: {
            payout_id: payout.id,
            wallet_id: payout.wallet_id,
            reconcile_run_id: runId,
            auto_healed: true,
          },
          postings: [
            {
              accountCode: 'creator_payable',
              direction: 'debit',
              amountMinor: Number(payout.amount || 0),
              currency: String(payout.currency || 'USD').toUpperCase(),
              counterpartyType: 'creator',
              counterpartyId: (payout.wallets as any)?.photographer_id || null,
            },
            {
              accountCode: 'creator_payouts',
              direction: 'credit',
              amountMinor: Number(payout.amount || 0),
              currency: String(payout.currency || 'USD').toUpperCase(),
              counterpartyType: 'creator',
              counterpartyId: (payout.wallets as any)?.photographer_id || null,
            },
          ],
        }).catch(() => {
          // Reconciliation will keep issue open if heal fails.
        });
      }

      const { data: healedJournal } = await supabase
        .from('financial_journals')
        .select('id')
        .eq('source_kind', 'payout')
        .eq('source_id', payout.id)
        .eq('flow_type', 'payout')
        .limit(1)
        .maybeSingle();

      const healed = !dryRun && Boolean(healedJournal?.id);
      await upsertReconciliationIssue(supabase, {
        runId,
        issueKey: `missing_payout_journal:payout:${payout.id}`,
        issueType: 'missing_payout_journal',
        sourceKind: 'payout',
        sourceId: payout.id,
        severity: 'error',
        autoHealed: healed,
        resolved: healed,
        details: {
          payout_id: payout.id,
          dry_run: dryRun,
        },
      });

      issues += 1;
      if (healed) autoHealed += 1;
    }

    await supabase
      .from('financial_reconciliation_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: {
          dryRun,
          limit,
          checked,
          issues,
          autoHealed,
        },
      })
      .eq('id', runId);

    return NextResponse.json({
      success: true,
      runId,
      dryRun,
      checked,
      issues,
      autoHealed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Finance reconcile error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Finance reconcile failed',
      },
      { status: 500 }
    );
  }
}
