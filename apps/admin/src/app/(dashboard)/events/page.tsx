import { Loader2, Calendar, Image, DollarSign, Eye } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { supabaseAdmin } from '@/lib/supabase';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';

import { FilterSelect } from './filter-select';

interface SearchParams {
  search?: string;
  status?: string;
  page?: string;
}

async function getEvents(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    // Use service role client which bypasses RLS completely
    // Use explicit foreign key reference for the photographer join
    // Note: media filter for deleted_at is handled separately
    let query = supabaseAdmin
      .from('events')
      .select(`
        *,
        photographer:photographers!photographer_id (id, display_name, email),
        transactions (id, gross_amount, status)
      `, { count: 'exact' });

    if (searchParams.search) {
      query = query.ilike('name', `%${searchParams.search}%`);
    }

    if (searchParams.status) {
      query = query.eq('status', searchParams.status);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      
      // If join fails due to RLS (shouldn't happen with service role, but fallback)
      // Try querying events without joins first
      if (error.message?.includes('permission') || error.message?.includes('policy') || error.code === '42501') {
        console.warn('RLS error detected with service role - this should not happen. Trying fallback query.');
        
        // Fallback: query events without joins
        const { data: simpleData, error: simpleError, count: simpleCount } = await supabaseAdmin
          .from('events')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (!simpleError && simpleData && simpleData.length > 0) {
          // Fetch related data in separate queries
          const photographerIds = [...new Set(simpleData.map(e => e.photographer_id))];
          const eventIds = simpleData.map(e => e.id);
          
          const [photographersRes, mediaRes, transactionsRes] = await Promise.all([
            supabaseAdmin.from('photographers').select('id, display_name, email').in('id', photographerIds),
            // Filter out soft-deleted media
            supabaseAdmin.from('media').select('id, event_id').in('event_id', eventIds).is('deleted_at', null),
            supabaseAdmin.from('transactions').select('id, event_id, gross_amount, status').in('event_id', eventIds),
          ]);
          
          // Build maps for joins
          const photographersMap = new Map(photographersRes.data?.map(p => [p.id, p]) || []);
          const mediaCountMap = new Map<string, number>();
          const transactionsMap = new Map<string, any[]>();
          
          // Count media per event instead of storing array
          mediaRes.data?.forEach(m => {
            mediaCountMap.set(m.event_id, (mediaCountMap.get(m.event_id) || 0) + 1);
          });
          
          transactionsRes.data?.forEach(t => {
            if (!transactionsMap.has(t.event_id)) transactionsMap.set(t.event_id, []);
            transactionsMap.get(t.event_id)!.push(t);
          });
          
          // Combine data
          const eventsWithJoins = simpleData.map(event => ({
            ...event,
            photographer: photographersMap.get(event.photographer_id) || null,
            mediaCount: mediaCountMap.get(event.id) || 0,
            transactions: transactionsMap.get(event.id) || [],
          }));
          
          return {
            events: eventsWithJoins,
            total: simpleCount || 0,
            page,
            limit,
          };
        }
      }
      
      return {
        events: [],
        total: 0,
        page,
        limit,
        error: error.message || 'Failed to fetch events',
      };
    }

    // If join query returns empty, try a simpler query and rebuild joins
    if ((data?.length || 0) === 0) {
      let simpleQuery = supabaseAdmin
        .from('events')
        .select('*', { count: 'exact' });

      if (searchParams.search) {
        simpleQuery = simpleQuery.ilike('name', `%${searchParams.search}%`);
      }

      if (searchParams.status) {
        simpleQuery = simpleQuery.eq('status', searchParams.status);
      }

      const { data: simpleData, error: simpleError, count: simpleCount } = await simpleQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!simpleError && simpleData && simpleData.length > 0) {
        const photographerIds = [...new Set(simpleData.map((e) => e.photographer_id))];
        const eventIds = simpleData.map((e) => e.id);

        const [photographersRes, mediaRes, transactionsRes] = await Promise.all([
          supabaseAdmin.from('photographers').select('id, display_name, email').in('id', photographerIds),
          // Filter out soft-deleted media
          supabaseAdmin.from('media').select('id, event_id').in('event_id', eventIds).is('deleted_at', null),
          supabaseAdmin.from('transactions').select('id, event_id, gross_amount, status').in('event_id', eventIds),
        ]);

        const photographersMap = new Map(photographersRes.data?.map((p) => [p.id, p]) || []);
        const mediaCountMap = new Map<string, number>();
        const transactionsMap = new Map<string, any[]>();

        // Count media per event instead of storing array
        mediaRes.data?.forEach((m) => {
          mediaCountMap.set(m.event_id, (mediaCountMap.get(m.event_id) || 0) + 1);
        });

        transactionsRes.data?.forEach((t) => {
          if (!transactionsMap.has(t.event_id)) transactionsMap.set(t.event_id, []);
          transactionsMap.get(t.event_id)!.push(t);
        });

        const eventsWithJoins = simpleData.map((event) => ({
          ...event,
          photographer: photographersMap.get(event.photographer_id) || null,
          mediaCount: mediaCountMap.get(event.id) || 0,
          transactions: transactionsMap.get(event.id) || [],
        }));

        return {
          events: eventsWithJoins,
          total: simpleCount || 0,
          page,
          limit,
        };
      }
    }

    // Main success path - fetch media counts separately since we removed media from the join
    if (data && data.length > 0) {
      const eventIds = data.map((e: any) => e.id);
      
      // Get media counts for all events (excluding soft-deleted)
      const { data: mediaData } = await supabaseAdmin
        .from('media')
        .select('event_id')
        .in('event_id', eventIds)
        .is('deleted_at', null);
      
      // Count media per event
      const mediaCountMap = new Map<string, number>();
      mediaData?.forEach((m) => {
        mediaCountMap.set(m.event_id, (mediaCountMap.get(m.event_id) || 0) + 1);
      });
      
      // Add media counts to events
      const eventsWithCounts = data.map((event: any) => ({
        ...event,
        mediaCount: mediaCountMap.get(event.id) || 0,
      }));
      
      // Log for debugging (remove in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('Events fetched:', {
          count: eventsWithCounts.length,
          total: count || 0,
          mediaCounts: Object.fromEntries(mediaCountMap),
        });
      }

      return {
        events: eventsWithCounts,
        total: count || 0,
        page,
        limit,
      };
    }

    return {
      events: data || [],
      total: count || 0,
      page,
      limit,
    };
  } catch (error: any) {
    console.error('Error in getEvents:', error);
    return {
      events: [],
      total: 0,
      page,
      limit,
      error: error?.message || 'Failed to fetch events',
    };
  }
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { events, total, page, limit, error } = await getEvents(searchParams);
  const totalPages = Math.ceil(total / limit);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-500',
    active: 'bg-green-500/10 text-green-500',
    closed: 'bg-blue-500/10 text-blue-500',
    archived: 'bg-yellow-500/10 text-yellow-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
        <p className="text-muted-foreground mt-1">
          Manage all platform events
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <form className="flex-1">
          <input
            type="text"
            name="search"
            defaultValue={searchParams.search}
            placeholder="Search events..."
            className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
          />
        </form>
        <FilterSelect
          name="status"
          defaultValue={searchParams.status}
          placeholder="All Statuses"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Closed' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-destructive bg-destructive/10 p-4 text-center">
          <p className="text-destructive font-medium">Error loading events</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {/* Event List */}
      {!error && (
        <>
          {events.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-muted-foreground">No events found</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Creator</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Photos</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Revenue</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Created</th>
                    <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event: any) => {
                    const revenue = event.transactions
                      ?.filter((t: any) => t.status === 'succeeded')
                      .reduce((sum: number, t: any) => sum + (t.gross_amount || 0), 0) || 0;

                    return (
                      <tr key={event.id} className="hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-foreground">{event.name}</p>
                            {event.event_date && (
                              <p className="text-sm text-muted-foreground">{formatDate(event.event_date)}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-foreground">{event.photographer?.display_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{event.photographer?.email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-foreground">
                            <Image className="h-4 w-4 text-muted-foreground" />
                            {event.mediaCount ?? event.media?.length ?? 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-foreground">
                          {formatCurrency(revenue)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColors[event.status]}`}>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {formatDate(event.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/events/${event.id}`}
                            className="p-2 rounded-lg hover:bg-muted inline-flex"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Link
              href={`?page=${page - 1}`}
              className={`px-4 py-2 rounded-lg border ${page <= 1 ? 'opacity-50 pointer-events-none' : ''}`}
            >
              Previous
            </Link>
            <Link
              href={`?page=${page + 1}`}
              className={`px-4 py-2 rounded-lg border ${page >= totalPages ? 'opacity-50 pointer-events-none' : ''}`}
            >
              Next
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
