/**
 * Realtime Subscription Hooks for Mobile
 * 
 * Provides easy-to-use hooks for subscribing to database changes.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'events' | 'media' | 'transactions' | 'notifications' | 'face_matches' | 'entitlements';
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeOptions {
  table: TableName;
  event?: EventType;
  filter?: string;
  onInsert?: (record: any) => void;
  onUpdate?: (record: any) => void;
  onDelete?: (record: any) => void;
  onChange?: (payload: any) => void;
}

/**
 * Subscribe to realtime changes on a table
 */
export function useRealtimeSubscription(options: RealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    const { table, event = '*', filter, onInsert, onUpdate, onDelete, onChange } = options;

    const channelConfig = {
      event,
      schema: 'public',
      table,
      ...(filter && { filter }),
    };

    const newChannel = supabase
      .channel(`realtime:${table}:${filter || 'all'}`)
      .on('postgres_changes', channelConfig, (payload) => {
        onChange?.(payload);
        
        switch (payload.eventType) {
          case 'INSERT':
            onInsert?.(payload.new);
            break;
          case 'UPDATE':
            onUpdate?.(payload.new);
            break;
          case 'DELETE':
            onDelete?.(payload.old);
            break;
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    setChannel(newChannel);

    return () => {
      supabase.removeChannel(newChannel);
    };
  }, [options.table, options.filter]);

  return { isConnected, channel };
}

/**
 * Hook for fetching data with automatic refresh on realtime updates
 */
export function useRealtimeQuery<T>(
  queryFn: () => Promise<T>,
  table: TableName,
  filter?: string
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await queryFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  }, [queryFn]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscribe to realtime updates
  useRealtimeSubscription({
    table,
    filter,
    onChange: () => {
      fetchData();
    },
  });

  return { data, isLoading, error, refetch: fetchData };
}

/**
 * Hook for subscribing to a specific record
 */
export function useRealtimeRecord<T extends { id: string }>(
  table: TableName,
  recordId: string,
  initialData?: T
) {
  const [record, setRecord] = useState<T | undefined>(initialData);

  useRealtimeSubscription({
    table,
    filter: `id=eq.${recordId}`,
    onUpdate: (updated) => {
      setRecord(updated as T);
    },
    onDelete: () => {
      setRecord(undefined);
    },
  });

  return record;
}

/**
 * Hook for live event photo count
 */
export function useEventPhotoCount(eventId: string, initialCount: number = 0) {
  const [photoCount, setPhotoCount] = useState(initialCount);

  useRealtimeSubscription({
    table: 'media',
    filter: `event_id=eq.${eventId}`,
    onInsert: () => setPhotoCount((prev) => prev + 1),
    onDelete: () => setPhotoCount((prev) => Math.max(0, prev - 1)),
  });

  return photoCount;
}

/**
 * Hook for live face match updates
 */
export function useFaceMatches(
  attendeeId: string,
  onNewMatch?: (match: any) => void
) {
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    // Fetch initial matches
    const fetchMatches = async () => {
      const { data } = await supabase
        .from('face_matches')
        .select('*, media(*), events(*)')
        .eq('attendee_id', attendeeId)
        .order('created_at', { ascending: false });
      
      setMatches(data || []);
    };

    fetchMatches();
  }, [attendeeId]);

  useRealtimeSubscription({
    table: 'face_matches',
    filter: `attendee_id=eq.${attendeeId}`,
    onInsert: (newMatch) => {
      setMatches((prev) => [newMatch, ...prev]);
      onNewMatch?.(newMatch);
    },
  });

  return matches;
}
