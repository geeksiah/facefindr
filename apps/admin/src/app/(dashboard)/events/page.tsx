import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2, Calendar, Image, DollarSign, Eye } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';

interface SearchParams {
  search?: string;
  status?: string;
  page?: string;
}

async function getEvents(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('events')
    .select(`
      *,
      photographers (id, display_name, email),
      media (id),
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

  const { data, count } = await query;

  return {
    events: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { events, total, page, limit } = await getEvents(searchParams);
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
        <select
          defaultValue={searchParams.status}
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) {
              url.searchParams.set('status', e.target.value);
            } else {
              url.searchParams.delete('status');
            }
            window.location.href = url.toString();
          }}
          className="px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Event List */}
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
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Photographer</th>
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
                      <p className="text-foreground">{event.photographers?.display_name || 'Unknown'}</p>
                      <p className="text-sm text-muted-foreground">{event.photographers?.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-foreground">
                        <Image className="h-4 w-4 text-muted-foreground" />
                        {event.media?.length || 0}
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
