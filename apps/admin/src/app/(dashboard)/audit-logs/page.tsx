import Link from 'next/link';

import { supabaseAdmin } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';

import { FilterSelect } from './filter-select';

interface SearchParams {
  action?: string;
  admin?: string;
  page?: string;
}

async function getAuditLogs(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('admin_audit_logs')
    .select('*', { count: 'exact' });

  if (searchParams.action) {
    query = query.eq('action', searchParams.action);
  }

  if (searchParams.admin) {
    query = query.eq('admin_id', searchParams.admin);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count } = await query;

  return {
    logs: data || [],
    total: count || 0,
    page,
    limit,
  };
}

async function getAdmins() {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('id, name, email');
  return data || [];
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [{ logs, total, page, limit }, admins] = await Promise.all([
    getAuditLogs(searchParams),
    getAdmins(),
  ]);

  const totalPages = Math.ceil(total / limit);

  const actionColors: Record<string, string> = {
    login: 'text-green-500',
    logout: 'text-blue-500',
    user_suspend: 'text-red-500',
    user_unsuspend: 'text-green-500',
    user_delete: 'text-red-500',
    payout_process: 'text-yellow-500',
    settings_update: 'text-purple-500',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">
          Track all administrative actions on the platform
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <FilterSelect
          name="action"
          defaultValue={searchParams.action}
          placeholder="All Actions"
          options={[
            { value: 'login', label: 'Login' },
            { value: 'logout', label: 'Logout' },
            { value: 'user_suspend', label: 'User Suspend' },
            { value: 'user_unsuspend', label: 'User Unsuspend' },
            { value: 'user_delete', label: 'User Delete' },
            { value: 'payout_process', label: 'Payout Process' },
            { value: 'settings_update', label: 'Settings Update' },
          ]}
        />

        <FilterSelect
          name="admin"
          defaultValue={searchParams.admin}
          placeholder="All Admins"
          options={admins.map((admin) => ({ value: admin.id, label: admin.name || admin.email }))}
        />
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No audit logs found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Timestamp</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Admin</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Action</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Resource</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">IP Address</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-foreground">{log.admin_email || 'System'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${actionColors[log.action] || 'text-foreground'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {log.resource_type && (
                      <span className="text-muted-foreground">
                        {log.resource_type}
                        {log.resource_id && (
                          <span className="font-mono text-xs ml-2">
                            {log.resource_id.slice(0, 8)}...
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-muted-foreground">
                    {log.ip_address || '-'}
                  </td>
                  <td className="px-6 py-4">
                    {log.details && Object.keys(log.details).length > 0 && (
                      <pre className="text-xs text-muted-foreground max-w-xs truncate">
                        {JSON.stringify(log.details)}
                      </pre>
                    )}
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
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
          </p>
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
