'use client';

import {
  MoreHorizontal,
  Eye,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatCurrency, formatDateTime } from '@/lib/utils';

interface Transaction {
  id: string;
  gross_amount: number;
  net_amount: number;
  platform_fee: number;
  provider_fee: number;
  currency: string;
  status: string;
  payment_provider: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  events: { id: string; name: string } | null;
}

interface TransactionListProps {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export function TransactionList({ transactions, total, page, limit }: TransactionListProps) {
  const router = useRouter();
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const totalPages = Math.ceil(total / limit);

  const handleRefund = async (transactionId: string) => {
    if (!confirm('Are you sure you want to refund this transaction?')) return;
    
    try {
      const response = await fetch(`/api/admin/transactions/${transactionId}/refund`, {
        method: 'POST',
      });
      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Refund failed:', error);
    }
  };

  const statusIcons: Record<string, React.ReactNode> = {
    succeeded: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    refunded: <RotateCcw className="h-4 w-4 text-blue-500" />,
  };

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">No transactions found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">ID</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Event</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Amount</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Fees</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Provider</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Date</th>
              <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm text-foreground">{tx.id.slice(0, 8)}...</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-foreground">{tx.events?.name || 'Unknown'}</span>
                </td>
                <td className="px-6 py-4">
                  <p className="font-medium text-foreground">{formatCurrency(tx.gross_amount, tx.currency)}</p>
                  <p className="text-xs text-muted-foreground">Net: {formatCurrency(tx.net_amount, tx.currency)}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-muted-foreground">
                    Platform: {formatCurrency(tx.platform_fee, tx.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provider: {formatCurrency(tx.provider_fee, tx.currency)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span className="capitalize text-foreground">{tx.payment_provider}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {statusIcons[tx.status]}
                    <span className="capitalize text-foreground">{tx.status}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {formatDateTime(tx.created_at)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end relative">
                    <button
                      onClick={() => setActionMenuId(actionMenuId === tx.id ? null : tx.id)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>

                    {actionMenuId === tx.id && (
                      <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border bg-card shadow-lg z-10">
                        <div className="py-1">
                          <Link
                            href={`/transactions/${tx.id}`}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <Eye className="h-4 w-4" />
                            View Details
                          </Link>
                          {tx.status === 'succeeded' && (
                            <button
                              onClick={() => handleRefund(tx.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-muted"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Issue Refund
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Link
              href={`?page=${page - 1}`}
              className={`p-2 rounded-lg border border-border hover:bg-muted ${page <= 1 ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <Link
              href={`?page=${page + 1}`}
              className={`p-2 rounded-lg border border-border hover:bg-muted ${page >= totalPages ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
