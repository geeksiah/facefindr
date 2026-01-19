'use client';

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';

interface RealtimeContextValue {
  subscribe: (table: string, callback: (payload: unknown) => void) => () => void;
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

// Client-side Supabase client for realtime only
// Note: This uses anon key - only for realtime subscriptions
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase realtime credentials not configured');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    clientRef.current = supabase;

    // Monitor connection status
    const channel = supabase.channel('system')
      .on('system', { event: '*' }, (payload) => {
        if (payload.event === 'connected') {
          setIsConnected(true);
        } else if (payload.event === 'disconnected') {
          setIsConnected(false);
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
      supabase.removeAllChannels();
    };
  }, []);

  const subscribe = useCallback((table: string, callback: (payload: unknown) => void) => {
    const client = clientRef.current;
    if (!client) return () => {};

    const channelName = `admin:${table}`;
    
    // Check if channel already exists
    let channel = channelsRef.current.get(channelName);
    
    if (!channel) {
      channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            callback(payload);
          }
        )
        .subscribe();

      channelsRef.current.set(channelName, channel);
    }

    return () => {
      // Don't unsubscribe individual callbacks - channel stays open
      // In production, you'd track callbacks per channel
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

// Hook for subscribing to a specific table
export function useRealtimeTable<T>(
  table: string,
  onInsert?: (record: T) => void,
  onUpdate?: (record: T) => void,
  onDelete?: (record: T) => void
) {
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe(table, (payload) => {
      switch (payload.eventType) {
        case 'INSERT':
          onInsert?.(payload.new as T);
          break;
        case 'UPDATE':
          onUpdate?.(payload.new as T);
          break;
        case 'DELETE':
          onDelete?.(payload.old as T);
          break;
      }
    });

    return unsubscribe;
  }, [table, subscribe, onInsert, onUpdate, onDelete]);
}
