import { Suspense } from 'react';

import { supabaseAdmin } from '@/lib/supabase';

import { SearchFilter } from './search-filter';
import { TransactionList } from './transaction-list';

interface SearchParams {
  search?: string;
  status?: string;
  provider?: string;
  page?: string;
}

function deriveDropInProvider(paymentIntentId: string | null): string {
  const value = String(paymentIntentId || '').toLowerCase();
  if (!value) return 'unknown';
  if (value.startsWith('cs_')) return 'stripe';
  if (value.startsWith('dropincredits_')) return 'paystack';
  return 'unknown';
}

function mapDropInPurchaseStatus(status: string | null): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active' || normalized === 'exhausted') return 'succeeded';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'failed') return 'failed';
  return 'pending';
}

async function getTransactions(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let transactionQuery = supabaseAdmin
    .from('transactions')
    .select(`
      *,
      events (id, name),
      photographers:events(photographer_id, photographers(display_name, email))
    `, { count: 'exact' });

  if (searchParams.search) {
    transactionQuery = transactionQuery.ilike('id', `%${searchParams.search}%`);
  }

  if (searchParams.status) {
    transactionQuery = transactionQuery.eq('status', searchParams.status);
  }

  if (searchParams.provider) {
    transactionQuery = transactionQuery.eq('payment_provider', searchParams.provider);
  }

  transactionQuery = transactionQuery
    .order('created_at', { ascending: false })
    .limit(500);

  const { data: transactionRows, error } = await transactionQuery;

  if (error) {
    console.error('Error fetching transactions:', error);
    return { transactions: [], total: 0, page, limit };
  }

  let creditRows: any[] = [];
  let creditQuery = supabaseAdmin
    .from('drop_in_credit_purchases')
    .select('id, attendee_id, credits_purchased, amount_paid, currency, status, payment_intent_id, created_at');

  if (searchParams.search) {
    creditQuery = creditQuery.ilike('id', `%${searchParams.search}%`);
  }
  if (searchParams.status) {
    const requested = searchParams.status;
    if (requested === 'succeeded') {
      creditQuery = creditQuery.in('status', ['active', 'exhausted']);
    } else if (requested === 'pending') {
      creditQuery = creditQuery.eq('status', 'pending');
    } else if (requested === 'failed') {
      creditQuery = creditQuery.eq('status', 'failed');
    } else if (requested === 'refunded') {
      creditQuery = creditQuery.eq('status', '__none__');
    }
  }

  const { data: dropInPurchases, error: dropInPurchaseError } = await creditQuery
    .order('created_at', { ascending: false })
    .limit(500);

  if (dropInPurchaseError) {
    console.error('Error fetching drop-in credit purchases for transaction list:', dropInPurchaseError);
  } else {
    creditRows = (dropInPurchases || [])
      .map((purchase) => {
        const provider = deriveDropInProvider(purchase.payment_intent_id);
        if (searchParams.provider && provider !== searchParams.provider) {
          return null;
        }
        return {
          id: purchase.id,
          gross_amount: Number(purchase.amount_paid || 0),
          net_amount: Number(purchase.amount_paid || 0),
          platform_fee: 0,
          provider_fee: 0,
          currency: purchase.currency || 'USD',
          status: mapDropInPurchaseStatus(purchase.status),
          payment_provider: provider,
          stripe_payment_intent_id: purchase.payment_intent_id || null,
          created_at: purchase.created_at,
          events: null,
          transaction_type: 'drop_in_credit_purchase',
          metadata: {
            type: 'drop_in_credit_purchase',
            credits_purchased: Number(purchase.credits_purchased || 0),
            attendee_id: purchase.attendee_id || null,
          },
        };
      })
      .filter(Boolean) as any[];
  }

  const merged = [...(transactionRows || []), ...creditRows].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const paginated = merged.slice(offset, offset + limit);

  return {
    transactions: paginated,
    total: merged.length,
    page,
    limit,
  };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { transactions, total, page, limit } = await getTransactions(searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
        <p className="text-muted-foreground mt-1">
          View and manage all platform transactions
        </p>
      </div>

      <SearchFilter searchParams={searchParams} total={total} />

      <Suspense fallback={<ListLoading />}>
        <TransactionList 
          transactions={transactions}
          total={total}
          page={page}
          limit={limit}
        />
      </Suspense>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <div key={key} className="grid animate-pulse grid-cols-12 gap-4 border-b border-border pb-3 last:border-0">
            <div className="col-span-3 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
            <div className="col-span-2 h-4 rounded bg-muted" />
            <div className="col-span-3 h-4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
