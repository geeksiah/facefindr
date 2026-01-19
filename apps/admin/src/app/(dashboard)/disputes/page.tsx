import { AlertTriangle, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import Link from 'next/link';

import { supabaseAdmin } from '@/lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

import { FilterSelect } from './filter-select';

interface SearchParams {
  status?: string;
  page?: string;
}

async function getDisputes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('disputes')
    .select(`
      *,
      transactions (
        id,
        gross_amount,
        currency,
        events (name)
      ),
      admin_users:assigned_to (name, email)
    `, { count: 'exact' });

  if (searchParams.status) {
    query = query.eq('status', searchParams.status);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count } = await query;

  return {
    disputes: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { disputes, total, page, limit } = await getDisputes(searchParams);
  const totalPages = Math.ceil(total / limit);

  const statusIcons: Record<string, React.ReactNode> = {
    open: <AlertTriangle className="h-4 w-4 text-red-500" />,
    under_review: <Clock className="h-4 w-4 text-yellow-500" />,
    evidence_submitted: <Clock className="h-4 w-4 text-blue-500" />,
    won: <CheckCircle className="h-4 w-4 text-green-500" />,
    lost: <XCircle className="h-4 w-4 text-red-500" />,
    closed: <CheckCircle className="h-4 w-4 text-gray-500" />,
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-500/10 text-red-500',
    under_review: 'bg-yellow-500/10 text-yellow-500',
    evidence_submitted: 'bg-blue-500/10 text-blue-500',
    won: 'bg-green-500/10 text-green-500',
    lost: 'bg-red-500/10 text-red-500',
    closed: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Disputes</h1>
        <p className="text-muted-foreground mt-1">
          Manage payment disputes and chargebacks
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <FilterSelect
          name="status"
          defaultValue={searchParams.status}
          placeholder="All Statuses"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'under_review', label: 'Under Review' },
            { value: 'evidence_submitted', label: 'Evidence Submitted' },
            { value: 'won', label: 'Won' },
            { value: 'lost', label: 'Lost' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </div>

      {/* Disputes List */}
      {disputes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-foreground font-medium">No disputes</p>
          <p className="text-muted-foreground mt-1">All clear! No payment disputes to review.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Dispute</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Transaction</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Reason</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Due By</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Assigned</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {disputes.map((dispute: any) => (
                <tr key={dispute.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <p className="font-mono text-sm text-foreground">{dispute.id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground">{formatDate(dispute.created_at)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-foreground">{dispute.transactions?.events?.name || 'Unknown'}</p>
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">
                    {formatCurrency(dispute.amount, dispute.currency)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {dispute.reason?.replace(/_/g, ' ') || 'Not specified'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {statusIcons[dispute.status]}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[dispute.status]}`}>
                        {dispute.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {dispute.evidence_due_by ? (
                      <span className={`${
                        new Date(dispute.evidence_due_by) < new Date() 
                          ? 'text-red-500' 
                          : 'text-muted-foreground'
                      }`}>
                        {formatDate(dispute.evidence_due_by)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {dispute.admin_users ? (
                      <span className="text-foreground">{dispute.admin_users.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/disputes/${dispute.id}`}
                      className="p-2 rounded-lg hover:bg-muted inline-flex"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
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
