import { Loader2 } from 'lucide-react';
import { Suspense } from 'react';

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

  try {
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
      console.error('Error fetching attendees with joins:', error);
      
      // Fallback: query without joins
      let simpleQuery = supabaseAdmin
        .from('attendees')
        .select('*', { count: 'exact' });

      if (searchParams.search) {
        const search = `%${searchParams.search}%`;
        simpleQuery = simpleQuery.or(`email.ilike.${search},display_name.ilike.${search},face_tag.ilike.${search}`);
      }

      if (searchParams.status) {
        simpleQuery = simpleQuery.eq('status', searchParams.status);
      }

      const { data: simpleData, count: simpleCount, error: simpleError } = await simpleQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (simpleError) {
        console.error('Error fetching attendees (simple):', simpleError);
        return { attendees: [], total: 0, page, limit };
      }

      // Fetch related data separately
      if (simpleData && simpleData.length > 0) {
        const attendeeIds = simpleData.map(a => a.id);
        
        const [entitlementsRes, transactionsRes] = await Promise.all([
          supabaseAdmin.from('entitlements').select('id, attendee_id').in('attendee_id', attendeeIds),
          supabaseAdmin.from('transactions').select('id, attendee_id, gross_amount').in('attendee_id', attendeeIds),
        ]);

        const entitlementsMap = new Map<string, any[]>();
        const transactionsMap = new Map<string, any[]>();

        entitlementsRes.data?.forEach(e => {
          if (!entitlementsMap.has(e.attendee_id)) entitlementsMap.set(e.attendee_id, []);
          entitlementsMap.get(e.attendee_id)!.push(e);
        });

        transactionsRes.data?.forEach(t => {
          if (!transactionsMap.has(t.attendee_id)) transactionsMap.set(t.attendee_id, []);
          transactionsMap.get(t.attendee_id)!.push(t);
        });

        const attendeesWithJoins = simpleData.map(attendee => ({
          ...attendee,
          entitlements: entitlementsMap.get(attendee.id) || [],
          transactions: transactionsMap.get(attendee.id) || [],
        }));

        return {
          attendees: attendeesWithJoins,
          total: simpleCount || 0,
          page,
          limit,
        };
      }

      return { attendees: [], total: 0, page, limit };
    }

    return {
      attendees: data || [],
      total: count || 0,
      page,
      limit,
    };
  } catch (error) {
    console.error('Error in getAttendees:', error);
    return { attendees: [], total: 0, page, limit };
  }
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
