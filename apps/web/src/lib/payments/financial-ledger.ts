import { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

let warnedLedgerUnavailable = false;

export type FinancialFlowType =
  | 'photo_purchase'
  | 'tip'
  | 'subscription_charge'
  | 'drop_in_credit_purchase'
  | 'drop_in_credit_consumption'
  | 'payout'
  | 'refund';

export interface FinancialPostingInput {
  accountCode: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency?: string;
  counterpartyType?: 'creator' | 'attendee' | 'admin' | 'platform';
  counterpartyId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordFinancialJournalInput {
  idempotencyKey: string;
  sourceKind: string;
  sourceId: string;
  flowType: FinancialFlowType;
  currency: string;
  postings: FinancialPostingInput[];
  provider?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | Date | null;
}

export interface RecordFinancialJournalResult {
  enabled: boolean;
  journalId: string | null;
  replayed: boolean;
  skipped?: boolean;
  reason?: string;
}

export function isFinancialLedgerShadowWriteEnabled(): boolean {
  return (
    String(process.env.FINANCIAL_LEDGER_SHADOW_WRITES || '').toLowerCase() === 'true' ||
    String(process.env.ENABLE_FINANCIAL_LEDGER_SHADOW_WRITES || '').toLowerCase() === 'true'
  );
}

function toMinor(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeCurrency(value: unknown): string {
  return String(value || 'USD').trim().toUpperCase() || 'USD';
}

function mapPostingForRpc(posting: FinancialPostingInput, fallbackCurrency: string) {
  return {
    account_code: String(posting.accountCode || '').trim().toLowerCase(),
    direction: posting.direction,
    amount_minor: toMinor(posting.amountMinor),
    currency: normalizeCurrency(posting.currency || fallbackCurrency),
    counterparty_type: posting.counterpartyType || null,
    counterparty_id: posting.counterpartyId || null,
    metadata: posting.metadata || {},
  };
}

function isLedgerUnavailableError(error: any): boolean {
  const code = String(error?.code || '');
  return code === '42883' || code === '42P01' || code === '42704';
}

export async function recordFinancialJournal(
  supabase: ServiceClient,
  input: RecordFinancialJournalInput
): Promise<RecordFinancialJournalResult> {
  if (!isFinancialLedgerShadowWriteEnabled()) {
    return {
      enabled: false,
      journalId: null,
      replayed: false,
      skipped: true,
      reason: 'ledger-shadow-write-disabled',
    };
  }

  const currency = normalizeCurrency(input.currency);
  const postings = (input.postings || [])
    .map((posting) => mapPostingForRpc(posting, currency))
    .filter((posting) => posting.amount_minor > 0);

  if (postings.length < 2) {
    return {
      enabled: true,
      journalId: null,
      replayed: false,
      skipped: true,
      reason: 'insufficient-postings',
    };
  }

  const payload = {
    p_idempotency_key: String(input.idempotencyKey || '').trim(),
    p_source_kind: String(input.sourceKind || '').trim().toLowerCase(),
    p_source_id: String(input.sourceId || '').trim(),
    p_flow_type: String(input.flowType || '').trim().toLowerCase(),
    p_currency: currency,
    p_postings: postings,
    p_metadata: input.metadata || {},
    p_description: input.description || null,
    p_provider: input.provider || null,
    p_occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString(),
  };

  const { data, error } = await (supabase.rpc('record_financial_journal', payload) as any);
  if (error) {
    if (isLedgerUnavailableError(error)) {
      if (!warnedLedgerUnavailable) {
        warnedLedgerUnavailable = true;
        console.warn('[LEDGER] financial ledger migration is not yet available, skipping shadow write.');
      }
      return {
        enabled: true,
        journalId: null,
        replayed: false,
        skipped: true,
        reason: 'ledger-schema-unavailable',
      };
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    enabled: true,
    journalId: row?.journal_id || null,
    replayed: Boolean(row?.replayed),
  };
}

interface SettlementAmounts {
  grossAmountMinor: number;
  platformFeeMinor: number;
  providerFeeMinor: number;
  creatorNetMinor: number;
}

export function deriveSettlementAmounts(input: {
  grossAmountMinor?: number | null;
  platformFeeMinor?: number | null;
  providerFeeMinor?: number | null;
  netAmountMinor?: number | null;
}): SettlementAmounts {
  const gross = toMinor(input.grossAmountMinor);
  const platform = toMinor(input.platformFeeMinor);
  const provider = toMinor(input.providerFeeMinor);
  const explicitNet = toMinor(input.netAmountMinor);
  const creatorNet = explicitNet > 0 ? explicitNet : Math.max(0, gross - platform - provider);

  return {
    grossAmountMinor: gross,
    platformFeeMinor: platform,
    providerFeeMinor: provider,
    creatorNetMinor: creatorNet,
  };
}

export function buildSettlementCreditPostings(params: {
  currency: string;
  creatorId?: string | null;
  grossAmountMinor: number;
  platformFeeMinor: number;
  providerFeeMinor: number;
  creatorNetMinor: number;
  metadata?: Record<string, unknown>;
}): FinancialPostingInput[] {
  const currency = normalizeCurrency(params.currency);
  const postings: FinancialPostingInput[] = [
    {
      accountCode: 'platform_cash_clearing',
      direction: 'debit',
      amountMinor: params.grossAmountMinor,
      currency,
      metadata: params.metadata,
    },
    {
      accountCode: 'creator_payable',
      direction: 'credit',
      amountMinor: params.creatorNetMinor,
      currency,
      counterpartyType: params.creatorId ? 'creator' : undefined,
      counterpartyId: params.creatorId || null,
      metadata: params.metadata,
    },
    {
      accountCode: 'platform_revenue',
      direction: 'credit',
      amountMinor: params.platformFeeMinor,
      currency,
      metadata: params.metadata,
    },
    {
      accountCode: 'provider_fee_expense',
      direction: 'credit',
      amountMinor: params.providerFeeMinor,
      currency,
      metadata: params.metadata,
    },
  ];

  return postings.filter((posting) => toMinor(posting.amountMinor) > 0);
}

export function buildSettlementRefundPostings(params: {
  currency: string;
  creatorId?: string | null;
  grossAmountMinor: number;
  platformFeeMinor: number;
  providerFeeMinor: number;
  creatorNetMinor: number;
  metadata?: Record<string, unknown>;
}): FinancialPostingInput[] {
  const currency = normalizeCurrency(params.currency);
  const postings: FinancialPostingInput[] = [
    {
      accountCode: 'creator_payable',
      direction: 'debit',
      amountMinor: params.creatorNetMinor,
      currency,
      counterpartyType: params.creatorId ? 'creator' : undefined,
      counterpartyId: params.creatorId || null,
      metadata: params.metadata,
    },
    {
      accountCode: 'refunds_contra_revenue',
      direction: 'debit',
      amountMinor: params.platformFeeMinor,
      currency,
      metadata: params.metadata,
    },
    {
      accountCode: 'provider_fee_expense',
      direction: 'debit',
      amountMinor: params.providerFeeMinor,
      currency,
      metadata: params.metadata,
    },
    {
      accountCode: 'platform_cash_clearing',
      direction: 'credit',
      amountMinor: params.grossAmountMinor,
      currency,
      metadata: params.metadata,
    },
  ];

  return postings.filter((posting) => toMinor(posting.amountMinor) > 0);
}
