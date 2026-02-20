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

  let tipRows: any[] = [];
  const includeTips = !searchParams.provider || searchParams.provider === 'tip';

  if (includeTips) {
    let tipQuery = supabaseAdmin
      .from('tips')
      .select('id, amount, currency, status, created_at, event_id, stripe_payment_intent_id');

    if (searchParams.search) {
      tipQuery = tipQuery.ilike('id', `%${searchParams.search}%`);
    }

    if (searchParams.status === 'succeeded') {
      tipQuery = tipQuery.eq('status', 'completed');
    } else if (searchParams.status === 'failed') {
      tipQuery = tipQuery.eq('status', 'failed');
    } else if (searchParams.status === 'refunded') {
      tipQuery = tipQuery.eq('status', 'refunded');
    } else if (searchParams.status === 'pending') {
      tipQuery = tipQuery.eq('status', 'pending');
    }

    const { data: tips, error: tipsError } = await tipQuery
      .order('created_at', { ascending: false })
      .limit(500);

    if (tipsError) {
      console.error('Error fetching tips for transaction list:', tipsError);
    } else {
      tipRows = tips || [];
    }
  }

  const tipEventIds = Array.from(
    new Set(tipRows.map((tip) => tip.event_id).filter(Boolean))
  ) as string[];
  let tipEventsById = new Map<string, { id: string; name: string }>();

  if (tipEventIds.length > 0) {
    const { data: tipEvents } = await supabaseAdmin
      .from('events')
      .select('id, name')
      .in('id', tipEventIds);

    tipEventsById = new Map((tipEvents || []).map((event) => [event.id, event]));
  }

  const normalizedTips = tipRows.map((tip) => {
    const platformFee = Math.round(Number(tip.amount || 0) * 0.1);
    const normalizedStatus =
      tip.status === 'completed'
        ? 'succeeded'
        : tip.status === 'pending'
          ? 'pending'
          : tip.status;

    return {
      id: tip.id,
      gross_amount: Number(tip.amount || 0),
      net_amount: Number(tip.amount || 0) - platformFee,
      platform_fee: platformFee,
      provider_fee: 0,
      currency: tip.currency || 'USD',
      status: normalizedStatus,
      payment_provider: 'tip',
      stripe_payment_intent_id: tip.stripe_payment_intent_id || null,
      created_at: tip.created_at,
      events: tip.event_id ? tipEventsById.get(tip.event_id) || null : null,
    };
  });

  const merged = [...(transactionRows || []), ...normalizedTips].sort(
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
