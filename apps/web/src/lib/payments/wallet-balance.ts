import { createServiceClient } from '@/lib/supabase/server';

type ServiceClient = ReturnType<typeof createServiceClient>;

interface TransactionRow {
  id: string;
  wallet_id: string | null;
  status: string | null;
  currency: string | null;
  gross_amount: number | null;
  platform_fee: number | null;
  provider_fee: number | null;
  net_amount: number | null;
  metadata: Record<string, unknown> | null;
}

interface WalletRow {
  id: string;
  photographer_id: string | null;
  provider: string | null;
  status: string | null;
}

function toMinorUnits(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

function toMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveNetAmount(row: TransactionRow): number {
  const explicitNet = toMinorUnits(row.net_amount);
  if (explicitNet > 0) return explicitNet;

  const gross = toMinorUnits(row.gross_amount);
  const platformFee = toMinorUnits(row.platform_fee);
  const providerFee = toMinorUnits(row.provider_fee);
  const derived = gross - platformFee - providerFee;
  return derived > 0 ? derived : 0;
}

export async function creditWalletFromTransaction(
  supabase: ServiceClient,
  transactionId: string
): Promise<{ credited: boolean; amountCredited: number; reason?: string }> {
  const { data: transaction, error: transactionError } = await (supabase
    .from('transactions') as any)
    .select(
      'id, wallet_id, status, currency, gross_amount, platform_fee, provider_fee, net_amount, metadata'
    )
    .eq('id', transactionId)
    .maybeSingle();

  if (transactionError || !transaction) {
    return { credited: false, amountCredited: 0, reason: 'transaction_not_found' };
  }

  const row = transaction as TransactionRow;
  const normalizedStatus = String(row.status || '').toLowerCase();
  if (normalizedStatus !== 'succeeded' && normalizedStatus !== 'completed') {
    return { credited: false, amountCredited: 0, reason: 'transaction_not_settled' };
  }

  if (!row.wallet_id) {
    return { credited: false, amountCredited: 0, reason: 'wallet_id_missing' };
  }

  const metadata = toMetadataObject(row.metadata);
  if (metadata.wallet_credit_applied === true) {
    return { credited: false, amountCredited: 0, reason: 'already_credited' };
  }

  const amountToCredit = resolveNetAmount(row);
  if (amountToCredit <= 0) {
    return { credited: false, amountCredited: 0, reason: 'non_positive_net_amount' };
  }

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, photographer_id, provider, status')
    .eq('id', row.wallet_id)
    .maybeSingle();
  if (!wallet?.id) {
    return { credited: false, amountCredited: 0, reason: 'wallet_not_found' };
  }

  const walletRow = wallet as WalletRow;
  const { data: existingBalance } = await supabase
    .from('wallet_balances')
    .select(
      'wallet_id, photographer_id, provider, status, currency, available_balance, total_earnings, total_paid_out, pending_payout'
    )
    .eq('wallet_id', walletRow.id)
    .maybeSingle();

  const currentAvailable = toMinorUnits((existingBalance as any)?.available_balance);
  const currentEarnings = toMinorUnits((existingBalance as any)?.total_earnings);
  const currentPaidOut = toMinorUnits((existingBalance as any)?.total_paid_out);
  const currentPending = toMinorUnits((existingBalance as any)?.pending_payout);

  const { error: upsertError } = await (supabase.from('wallet_balances') as any).upsert({
    wallet_id: walletRow.id,
    photographer_id:
      (existingBalance as any)?.photographer_id || walletRow.photographer_id || null,
    provider: (existingBalance as any)?.provider || walletRow.provider || 'stripe',
    status: (existingBalance as any)?.status || walletRow.status || 'active',
    currency: row.currency || (existingBalance as any)?.currency || 'USD',
    available_balance: currentAvailable + amountToCredit,
    total_earnings: currentEarnings + amountToCredit,
    total_paid_out: currentPaidOut,
    pending_payout: currentPending + amountToCredit,
  });

  if (upsertError) {
    return { credited: false, amountCredited: 0, reason: upsertError.message };
  }

  const nextMetadata = {
    ...metadata,
    wallet_credit_applied: true,
    wallet_credit_amount: amountToCredit,
    wallet_credit_at: new Date().toISOString(),
  };

  await (supabase.from('transactions') as any)
    .update({ metadata: nextMetadata })
    .eq('id', transactionId);

  return { credited: true, amountCredited: amountToCredit };
}
