'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface ExportData {
  dailyRevenue: Array<{
    date: string;
    revenue: number;
    fees: number;
    transactions: number;
  }>;
  summary: {
    totalRevenue: number;
    totalFees: number;
    totalTransactions: number;
    avgTransactionValue: number;
  };
}

export function ExportButton({ data }: { data: ExportData }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Create CSV content
      const headers = ['Date', 'Revenue (cents)', 'Platform Fees (cents)', 'Transactions'];
      const rows = data.dailyRevenue.map((d) => [
        d.date,
        d.revenue.toString(),
        d.fees.toString(),
        d.transactions.toString(),
      ]);

      // Add summary
      rows.push([]);
      rows.push(['Summary']);
      rows.push(['Total Revenue', data.summary.totalRevenue.toString()]);
      rows.push(['Total Platform Fees', data.summary.totalFees.toString()]);
      rows.push(['Total Transactions', data.summary.totalTransactions.toString()]);
      rows.push(['Average Transaction', data.summary.avgTransactionValue.toFixed(0)]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `facefindr-analytics-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Export CSV
    </button>
  );
}
