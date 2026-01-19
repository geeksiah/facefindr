import { Search, Filter, Loader2 } from 'lucide-react';
import { Suspense } from 'react';

import { supabaseAdmin } from '@/lib/supabase';

import { PhotographerList } from './photographer-list';
import { SearchFilter } from './search-filter';

interface SearchParams {
  search?: string;
  status?: string;
  plan?: string;
  page?: string;
}

async function getPhotographers(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('photographers')
    .select(`
      *,
      subscriptions (
        plan_code,
        status
      ),
      wallets (
        id,
        provider
      ),
      events (id)
    `, { count: 'exact' });

  // Apply search filter
  if (searchParams.search) {
    const search = `%${searchParams.search}%`;
    query = query.or(`email.ilike.${search},display_name.ilike.${search},business_name.ilike.${search}`);
  }

  // Apply status filter
  if (searchParams.status) {
    query = query.eq('status', searchParams.status);
  }

  // Order and paginate
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching photographers:', error);
    return { photographers: [], total: 0, page, limit };
  }

  // Filter by plan if specified (done after fetch since it's a join)
  let photographers = data || [];
  if (searchParams.plan) {
    photographers = photographers.filter(
      (p) => p.subscriptions?.plan_code === searchParams.plan
    );
  }

  return {
    photographers,
    total: count || 0,
    page,
    limit,
  };
}

export default async function PhotographersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { photographers, total, page, limit } = await getPhotographers(searchParams);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Photographers</h1>
        <p className="text-muted-foreground mt-1">
          Manage photographer accounts, subscriptions, and access
        </p>
      </div>

      {/* Search and Filters */}
      <SearchFilter 
        searchParams={searchParams}
        total={total}
      />

      {/* Photographer List */}
      <Suspense fallback={<ListLoading />}>
        <PhotographerList 
          photographers={photographers}
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
