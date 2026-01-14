'use client';

import Link from 'next/link';
import { 
  Receipt, 
  UserPlus, 
  CreditCard, 
  ArrowUpRight,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { formatCurrency, formatDateTime, truncate } from '@/lib/utils';

interface Activity {
  transactions: Array<{
    id: string;
    gross_amount: number;
    status: string;
    created_at: string;
    events: { name: string } | null;
  }>;
  newUsers: Array<{
    id: string;
    display_name: string | null;
    email: string;
    created_at: string;
  }>;
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    wallets: {
      photographers: { display_name: string | null } | null;
    } | null;
  }>;
}

export function RecentActivity({ activity }: { activity: Activity }) {
  return (
    <>
      {/* Recent Transactions */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Recent Transactions</h2>
          </div>
          <Link 
            href="/transactions"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        
        {activity.transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activity.transactions.map((tx) => (
              <div key={tx.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIcon status={tx.status} />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {tx.events?.name || 'Unknown Event'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(tx.created_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${
                    tx.status === 'succeeded' ? 'text-green-500' : 
                    tx.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {formatCurrency(tx.gross_amount)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{tx.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Users & Recent Payouts */}
      <div className="space-y-6">
        {/* New Users */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">New Photographers</h2>
            </div>
            <Link 
              href="/photographers"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          
          {activity.newUsers.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No new photographers recently
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activity.newUsers.slice(0, 3).map((user) => (
                <div key={user.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                    {(user.display_name || user.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.display_name || 'No name'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(user.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payouts */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Recent Payouts</h2>
            </div>
            <Link 
              href="/payouts"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          
          {activity.payouts.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No payouts processed yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activity.payouts.slice(0, 3).map((payout) => (
                <div key={payout.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {payout.wallets?.photographers?.display_name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(payout.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(payout.amount, payout.currency)}
                    </p>
                    <p className={`text-xs capitalize ${
                      payout.status === 'completed' ? 'text-green-500' :
                      payout.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {payout.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}
