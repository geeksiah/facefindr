import { createServiceClient } from '@/lib/supabase/server';

import {
  buildSettlementCreditPostings,
  buildSettlementRefundPostings,
  deriveSettlementAmounts,
  recordFinancialJournal,
  type FinancialFlowType,
} from './financial-ledger';

type ServiceClient = ReturnType<typeof createServiceClient>;
type SubscriptionChargeScope =
  | 'creator_subscription'
  | 'attendee_subscription'
  | 'vault_subscription';

interface TransactionLedgerRow {
  id: string;
  wallet_id: string | null;
  payment_provider: string | null;
  currency: string | null;
  gross_amount: number | null;
  platform_fee: number | null;
  provider_fee: number | null;
  net_amount: number | null;
  event_id: string | null;
  metadata: Record<string, unknown> | null;
}

async function resolveCreatorIdFromWallet(supabase: ServiceClient, walletId: string | null): Promise<string | null> {
  if (!walletId) return null;
  const { data } = await supabase
    .from('wallets')
    .select('photographer_id')
    .eq('id', walletId)
    .maybeSingle();
  return data?.photographer_id || null;
}

async function fetchTransactionLedgerRow(
  supabase: ServiceClient,
  transactionId: string
): Promise<TransactionLedgerRow | null> {
  const { data } = await (supabase
    .from('transactions') as any)
    .select('id, wallet_id, payment_provider, currency, gross_amount, platform_fee, provider_fee, net_amount, event_id, metadata')
    .eq('id', transactionId)
    .maybeSingle();

  return (data as TransactionLedgerRow | null) || null;
}

export async function recordSettlementJournalForTransaction(
  supabase: ServiceClient,
  input: {
    transactionId: string;
    flowType: Extract<FinancialFlowType, 'photo_purchase' | 'tip'>;
    sourceKind: string;
    sourceId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const transaction = await fetchTransactionLedgerRow(supabase, input.transactionId);
  if (!transaction) return;

  const creatorId = await resolveCreatorIdFromWallet(supabase, transaction.wallet_id);
  const settlement = deriveSettlementAmounts({
    grossAmountMinor: transaction.gross_amount,
    platformFeeMinor: transaction.platform_fee,
    providerFeeMinor: transaction.provider_fee,
    netAmountMinor: transaction.net_amount,
  });

  await recordFinancialJournal(supabase, {
    idempotencyKey: `ledger:${input.flowType}:settlement:${input.sourceKind}:${input.sourceId}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    flowType: input.flowType,
    currency: String(transaction.currency || 'USD'),
    provider: transaction.payment_provider,
    description: input.description,
    metadata: {
      transaction_id: transaction.id,
      event_id: transaction.event_id,
      ...(transaction.metadata || {}),
      ...(input.metadata || {}),
    },
    postings: buildSettlementCreditPostings({
      currency: String(transaction.currency || 'USD'),
      creatorId,
      grossAmountMinor: settlement.grossAmountMinor,
      platformFeeMinor: settlement.platformFeeMinor,
      providerFeeMinor: settlement.providerFeeMinor,
      creatorNetMinor: settlement.creatorNetMinor,
      metadata: {
        transaction_id: transaction.id,
        flow_type: input.flowType,
      },
    }),
  });
}

export async function recordRefundJournalForTransaction(
  supabase: ServiceClient,
  input: {
    transactionId: string;
    sourceKind: string;
    sourceId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const transaction = await fetchTransactionLedgerRow(supabase, input.transactionId);
  if (!transaction) return;

  const creatorId = await resolveCreatorIdFromWallet(supabase, transaction.wallet_id);
  const settlement = deriveSettlementAmounts({
    grossAmountMinor: transaction.gross_amount,
    platformFeeMinor: transaction.platform_fee,
    providerFeeMinor: transaction.provider_fee,
    netAmountMinor: transaction.net_amount,
  });

  await recordFinancialJournal(supabase, {
    idempotencyKey: `ledger:refund:${input.sourceKind}:${input.sourceId}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    flowType: 'refund',
    currency: String(transaction.currency || 'USD'),
    provider: transaction.payment_provider,
    description: input.description,
    metadata: {
      transaction_id: transaction.id,
      event_id: transaction.event_id,
      ...(transaction.metadata || {}),
      ...(input.metadata || {}),
    },
    postings: buildSettlementRefundPostings({
      currency: String(transaction.currency || 'USD'),
      creatorId,
      grossAmountMinor: settlement.grossAmountMinor,
      platformFeeMinor: settlement.platformFeeMinor,
      providerFeeMinor: settlement.providerFeeMinor,
      creatorNetMinor: settlement.creatorNetMinor,
      metadata: {
        transaction_id: transaction.id,
      },
    }),
  });
}

export async function recordDropInCreditPurchaseJournal(
  supabase: ServiceClient,
  input: {
    purchaseId: string;
    attendeeId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    metadata?: Record<string, unknown>;
  }
) {
  await recordFinancialJournal(supabase, {
    idempotencyKey: `ledger:dropin_credit_purchase:${input.purchaseId}:success`,
    sourceKind: 'drop_in_credit_purchase',
    sourceId: input.purchaseId,
    flowType: 'drop_in_credit_purchase',
    currency: input.currency,
    provider: input.provider,
    description: 'Drop-in credit purchase settled',
    metadata: {
      purchase_id: input.purchaseId,
      attendee_id: input.attendeeId,
      ...(input.metadata || {}),
    },
    postings: [
      {
        accountCode: 'platform_cash_clearing',
        direction: 'debit',
        amountMinor: input.amountMinor,
        currency: input.currency,
        counterpartyType: 'attendee',
        counterpartyId: input.attendeeId,
      },
      {
        accountCode: 'attendee_credit_liability',
        direction: 'credit',
        amountMinor: input.amountMinor,
        currency: input.currency,
        counterpartyType: 'attendee',
        counterpartyId: input.attendeeId,
      },
    ],
  });
}

export async function recordSubscriptionChargeJournal(
  supabase: ServiceClient,
  input: {
    sourceKind: string;
    sourceId: string;
    amountMinor: number;
    currency: string;
    provider: string;
    scope: string;
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await recordFinancialJournal(supabase, {
    idempotencyKey: `ledger:subscription_charge:${input.provider}:${input.sourceKind}:${input.sourceId}`,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    flowType: 'subscription_charge',
    currency: input.currency,
    provider: input.provider,
    description: 'Subscription charge settled',
    metadata: {
      scope: input.scope,
      ...(input.metadata || {}),
    },
    postings: [
      {
        accountCode: 'platform_cash_clearing',
        direction: 'debit',
        amountMinor: input.amountMinor,
        currency: input.currency,
      },
      {
        accountCode: 'platform_revenue',
        direction: 'credit',
        amountMinor: input.amountMinor,
        currency: input.currency,
        counterpartyType: input.actorId ? 'creator' : undefined,
        counterpartyId: input.actorId || null,
      },
    ],
  });
}

export async function recordSubscriptionChargeJournalFromSourceRef(
  supabase: ServiceClient,
  input: {
    scope: SubscriptionChargeScope;
    sourceRef?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
    provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
    actorId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const sourceRef = String(input.sourceRef || '').trim();
  const amountMinor = Number.isFinite(Number(input.amountMinor))
    ? Math.max(0, Math.round(Number(input.amountMinor)))
    : 0;
  if (!sourceRef || amountMinor <= 0) return;

  await recordSubscriptionChargeJournal(supabase, {
    sourceKind: input.scope,
    sourceId: `${sourceRef}:${input.scope}`,
    amountMinor,
    currency: String(input.currency || 'USD').toUpperCase(),
    provider: input.provider,
    scope: input.scope,
    actorId: input.actorId || null,
    metadata: input.metadata || {},
  });
}
