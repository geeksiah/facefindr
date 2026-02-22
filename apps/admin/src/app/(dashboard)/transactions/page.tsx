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

async function getTransactions(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let transactionQuery = supabaseAdmin
    .from('admin_transaction_feed')
    .select('*', { count: 'exact' });

  if (searchParams.search) {
    const search = searchParams.search.trim();
    transactionQuery = transactionQuery.or(
      `feed_id.ilike.%${search}%,payment_reference.ilike.%${search}%`
    );
  }

  if (searchParams.status) {
    transactionQuery = transactionQuery.eq('status', searchParams.status);
  }

  if (searchParams.provider) {
    transactionQuery = transactionQuery.eq('payment_provider', searchParams.provider);
  }

  transactionQuery = transactionQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: transactionRows, error, count } = await transactionQuery;

  if (error) {
    console.error('Error fetching transactions:', error);
    return { transactions: [], total: 0, page, limit };
  }
  const normalizedRows = (transactionRows || []).map((row: any) => ({
    id: row.source_id,
    source_type: row.source_type,
    feed_id: row.feed_id,
    gross_amount: Number(row.gross_amount || 0),
    net_amount: Number(row.net_amount || 0),
    platform_fee: Number(row.platform_fee || 0),
    provider_fee: Number(row.provider_fee || 0),
    currency: row.currency || 'USD',
    status: row.status || 'pending',
    payment_provider: row.payment_provider || 'unknown',
    stripe_payment_intent_id: row.payment_reference || null,
    created_at: row.created_at,
    event_name: row.event_name || null,
    transaction_type: row.transaction_type || null,
    metadata: row.metadata || null,
  }));

  return {
    transactions: normalizedRows,
    total: count || 0,
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
