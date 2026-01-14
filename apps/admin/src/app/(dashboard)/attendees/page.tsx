import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { AttendeeList } from './attendee-list';
import { SearchFilter } from './search-filter';

interface SearchParams {
  search?: string;
  status?: string;
  page?: string;
}

async function getAttendees(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('attendees')
    .select(`
      *,
      entitlements (id),
      transactions (id, gross_amount)
    `, { count: 'exact' });

  // Apply search filter
  if (searchParams.search) {
    const search = `%${searchParams.search}%`;
    query = query.or(`email.ilike.${search},display_name.ilike.${search},face_tag.ilike.${search}`);
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
    console.error('Error fetching attendees:', error);
    return { attendees: [], total: 0, page, limit };
  }

  return {
    attendees: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export default async function AttendeesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { attendees, total, page, limit } = await getAttendees(searchParams);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendees</h1>
        <p className="text-muted-foreground mt-1">
          Manage attendee accounts, face profiles, and data requests
        </p>
      </div>

      {/* Search and Filters */}
      <SearchFilter 
        searchParams={searchParams}
        total={total}
      />

      {/* Attendee List */}
      <Suspense fallback={<ListLoading />}>
        <AttendeeList 
          attendees={attendees}
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
