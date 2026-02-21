export type FinancialFlowType =
  | 'photo_purchase'
  | 'tip'
  | 'subscription_charge'
  | 'drop_in_credit_purchase'
  | 'drop_in_credit_consumption'
  | 'payout'
  | 'refund';

export interface FinancialJournal {
  id: string;
  idempotencyKey: string;
  sourceKind: string;
  sourceId: string;
  flowType: FinancialFlowType;
  provider?: string | null;
  currency: string;
  description?: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface FinancialPosting {
  id: string;
  journalId: string;
  accountCode: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: string;
  counterpartyType?: 'creator' | 'attendee' | 'admin' | 'platform' | null;
  counterpartyId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FinancialReconciliationIssue {
  id: string;
  runId?: string | null;
  issueKey: string;
  issueType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  sourceKind: string;
  sourceId: string;
  status: 'open' | 'resolved' | 'ignored';
  autoHealed: boolean;
  resolvedAt?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
