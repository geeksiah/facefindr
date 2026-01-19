'use client';

/**
 * Realtime Stats Component
 * 
 * Shows live analytics with real-time updates.
 */

import { Eye, DollarSign, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { createClient } from '@/lib/supabase/client';

interface RealtimeStats {
  activeViewers: number;
  viewsThisHour: number;
  salesThisHour: number;
  revenueThisHour: number;
  viewsToday: number;
  salesToday: number;
  revenueToday: number;
}

export function RealtimeStats() {
  const [stats, setStats] = useState<RealtimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics?type=realtime');
      if (response.ok) {
        const data = await response.json();
        setStats(data.realtime);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch realtime stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchStats();

    // Poll every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    // Subscribe to realtime updates
    const supabase = createClient();
    
    const channel = supabase
      .channel('realtime-analytics')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'analytics_realtime',
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-32 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header with live indicator */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <h2 className="font-semibold text-foreground">Live Activity</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Updated {formatTimeAgo(lastUpdate)}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* This Hour */}
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-secondary">This Hour</p>
          
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/10 p-2">
              <Eye className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.viewsThisHour}</p>
              <p className="text-xs text-secondary">views</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-green-500/10 p-2">
              <DollarSign className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.revenueThisHour)}</p>
              <p className="text-xs text-secondary">revenue</p>
            </div>
          </div>
        </div>

        {/* Today */}
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-secondary">Today</p>
          
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-500/10 p-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.viewsToday}</p>
              <p className="text-xs text-secondary">views</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-500/10 p-2">
              <ShoppingCart className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.salesToday}</p>
              <p className="text-xs text-secondary">sales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active viewers */}
      {stats.activeViewers > 0 && (
        <div className="px-6 py-3 bg-muted/50 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-accent" />
            <span className="text-foreground">
              <strong>{stats.activeViewers}</strong> active viewer{stats.activeViewers !== 1 ? 's' : ''} right now
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleTimeString();
}
