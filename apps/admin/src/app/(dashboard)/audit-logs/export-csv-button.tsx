'use client';

import { Download } from 'lucide-react';

interface AuditRow {
  id: string;
  admin_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function ExportCsvButton({ logs }: { logs: AuditRow[] }) {
  const handleExport = () => {
    const header = [
      'id',
      'created_at',
      'admin_email',
      'action',
      'resource_type',
      'resource_id',
      'ip_address',
      'details',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.created_at,
      log.admin_email || '',
      log.action,
      log.resource_type || '',
      log.resource_id || '',
      log.ip_address || '',
      JSON.stringify(log.details || {}),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsv(String(value || ''))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </button>
  );
}
