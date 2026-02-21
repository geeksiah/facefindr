'use client';

import { 
  CreditCard, 
  Loader2, 
  Check, 
  AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatCurrency, getInitials } from '@/lib/utils';

interface PendingPayout {
  id: string;
  wallet_id: string;
  available_balance: number;
  pending_balance: number;
  currency: string;
  wallets: {
    id: string;
    provider: string;
    momo_provider: string | null;
    momo_account_number: string | null;
    photographers: {
      id: string;
      display_name: string | null;
      email: string;
    };
  };
}

export function PayoutQueue({ payouts }: { payouts: PendingPayout[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedPayouts, setSelectedPayouts] = useState<Set<string>>(new Set());

  const handleProcessSingle = async (walletId: string, amount: number, currency: string) => {
    setProcessing(walletId);
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `admin_manual_payout:${crypto.randomUUID()}`
          : `admin_manual_payout:${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const response = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          action: 'single',
          walletId,
          amount,
          currency,
          idempotencyKey,
        }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Payout failed:', error);
    } finally {
      setProcessing(null);
    }
  };

  const toggleSelect = (walletId: string) => {
    const newSelected = new Set(selectedPayouts);
    if (newSelected.has(walletId)) {
      newSelected.delete(walletId);
    } else {
      newSelected.add(walletId);
    }
    setSelectedPayouts(newSelected);
  };

  const selectAll = () => {
    if (selectedPayouts.size === payouts.length) {
      setSelectedPayouts(new Set());
    } else {
      setSelectedPayouts(new Set(payouts.map(p => p.wallet_id)));
    }
  };

  if (payouts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-semibold text-foreground">No pending payouts</h3>
        <p className="text-muted-foreground mt-1">
          All photographers have been paid out
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Payout Queue</h2>
        {selectedPayouts.size > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedPayouts.size} selected
          </span>
        )}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-6 py-3">
              <input
                type="checkbox"
                checked={selectedPayouts.size === payouts.length}
                onChange={selectAll}
                className="rounded border-input"
              />
            </th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
              Creator
            </th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
              Provider
            </th>
            <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">
              Amount
            </th>
            <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payouts.map((payout) => (
            <tr key={payout.wallet_id} className="hover:bg-muted/30 transition-colors">
              <td className="px-6 py-4">
                <input
                  type="checkbox"
                  checked={selectedPayouts.has(payout.wallet_id)}
                  onChange={() => toggleSelect(payout.wallet_id)}
                  className="rounded border-input"
                />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                    {getInitials(payout.wallets.photographers.display_name || payout.wallets.photographers.email)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {payout.wallets.photographers.display_name || 'No name'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {payout.wallets.photographers.email}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div>
                  <p className="font-medium text-foreground capitalize">
                    {payout.wallets.provider}
                  </p>
                  {payout.wallets.momo_provider && (
                    <p className="text-sm text-muted-foreground">
                      {payout.wallets.momo_provider} - {payout.wallets.momo_account_number}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <p className="font-bold text-foreground">
                  {formatCurrency(payout.available_balance, payout.currency)}
                </p>
                {payout.pending_balance > 0 && (
                  <p className="text-sm text-muted-foreground">
                    +{formatCurrency(payout.pending_balance, payout.currency)} pending
                  </p>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={() => handleProcessSingle(
                    payout.wallet_id,
                    payout.available_balance,
                    payout.currency
                  )}
                  disabled={processing === payout.wallet_id}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {processing === payout.wallet_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Pay Now'
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
