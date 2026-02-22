'use client';

import { Activity, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useRealtimeTable } from '@/components/realtime-provider';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface Stats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalCreators: number;
  totalAttendees: number;
  pendingPayouts: number;
  activeEvents: number;
  todayTransactions: number;
  baseCurrency?: string;
}

interface Transaction {
  id: string;
  gross_amount: number;
  status: string;
}

export function RealtimeStats({ initialStats }: { initialStats: Stats }) {
  const [stats, setStats] = useState(initialStats);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [isLive, setIsLive] = useState(false);

  // Subscribe to transactions table
  useRealtimeTable<Transaction>(
    'transactions',
    (newTransaction) => {
      // On INSERT
      if (newTransaction.status === 'succeeded') {
        setStats(prev => ({
          ...prev,
          todayTransactions: prev.todayTransactions + 1,
        }));
        setRecentTransactions(prev => [newTransaction, ...prev].slice(0, 5));
        setIsLive(true);
        setTimeout(() => setIsLive(false), 2000);
      }
    },
    (updatedTransaction) => {
      // On UPDATE keep counters stable to avoid over/under counting on status flips.
      void updatedTransaction;
    }
  );

  // Subscribe to photographers
  useRealtimeTable<{ id: string }>(
    'photographers',
    () => {
      setStats(prev => ({
        ...prev,
        totalCreators: prev.totalCreators + 1,
      }));
    }
  );

  // Subscribe to attendees
  useRealtimeTable<{ id: string }>(
    'attendees',
    () => {
      setStats(prev => ({
        ...prev,
        totalAttendees: prev.totalAttendees + 1,
      }));
    }
  );

  // Subscribe to events
  useRealtimeTable<{ id: string; status: string }>(
    'events',
    (newEvent) => {
      if (newEvent.status === 'active') {
        setStats(prev => ({
          ...prev,
          activeEvents: prev.activeEvents + 1,
        }));
      }
    },
    (updatedEvent) => {
      // Handle status changes
    }
  );

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Live Activity</h2>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          isLive 
            ? 'bg-green-500/10 text-green-500' 
            : 'bg-muted text-muted-foreground'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
          {isLive ? 'Live update' : 'Listening'}
        </div>
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBadge
          label="Revenue Snapshot"
          value={formatCurrency(stats.monthlyRevenue, stats.baseCurrency || 'USD')}
        />
        <MetricBadge
          label="Transactions"
          value={stats.todayTransactions.toString()}
        />
        <MetricBadge
          label="Total Users"
          value={formatNumber(stats.totalCreators + stats.totalAttendees)}
        />
        <MetricBadge
          label="Active Events"
          value={stats.activeEvents.toString()}
        />
      </div>

      {/* Recent Live Transactions */}
      {recentTransactions.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-3">Recent Transactions</p>
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div 
                key={tx.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-foreground">New transaction</span>
                </div>
                <span className="text-sm font-medium text-green-500">
                  +{formatCurrency(tx.gross_amount, stats.baseCurrency || 'USD')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}
