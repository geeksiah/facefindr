import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TransactionList } from './transaction-list';
import { SearchFilter } from './search-filter';

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
    <div className="flex items-center justify-center h-64 rounded-xl border border-border bg-card">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
