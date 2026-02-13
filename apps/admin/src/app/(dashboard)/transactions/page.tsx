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

  let query = supabaseAdmin
    .from('transactions')
    .select(`
      *,
      events (id, name),
      photographers:events(photographer_id, photographers(display_name, email))
    `, { count: 'exact' });

  if (searchParams.search) {
    query = query.ilike('id', `%${searchParams.search}%`);
  }

  if (searchParams.status) {
    query = query.eq('status', searchParams.status);
  }

  if (searchParams.provider) {
    query = query.eq('payment_provider', searchParams.provider);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching transactions:', error);
    return { transactions: [], total: 0, page, limit };
  }

  return {
    transactions: data || [],
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
