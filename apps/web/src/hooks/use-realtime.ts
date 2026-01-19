/**
 * Realtime Subscription Hooks for Web
 * 
 * Provides easy-to-use hooks for subscribing to database changes.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useState, useRef } from 'react';

import { createClient } from '@/lib/supabase/client';

type TableName =
  | 'events'
  | 'media'
  | 'transactions'
  | 'notifications'
  | 'face_matches'
  | 'entitlements'
  | 'photo_drop_matches'
  | 'drop_in_matches'
  | 'drop_in_notifications'
  | 'photo_vault'
  | 'storage_subscriptions'
  | 'storage_usage'
  | 'storage_plans'
  | 'platform_announcements'
  | 'follows'
  | 'photographer_connections'
  | 'attendees'
  | 'photographers';
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeOptions {
  table: TableName;
  event?: EventType;
  filter?: string;
  onInsert?: (record: unknown) => void;
  onUpdate?: (record: unknown) => void;
  onDelete?: (record: unknown) => void;
  onChange?: (payload: unknown) => void;
}

/**
 * Subscribe to realtime changes on a table
 */
export function useRealtimeSubscription(options: RealtimeOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    const { table, event = '*', filter } = options;
    const supabase = createClient();

    const channelConfig = {
      event,
      schema: 'public',
      table,
      ...(filter && { filter }),
    };

    let isMounted = true;

    try {
      const newChannel = supabase
        .channel(`realtime:${table}:${filter || 'all'}`)
        .on('postgres_changes', channelConfig, (payload) => {
          if (!isMounted) return;
          
          try {
            const { onInsert, onUpdate, onDelete, onChange } = callbacksRef.current;
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
          } catch (err) {
            // Silently ignore AbortError
            if (err instanceof Error && err.name === 'AbortError') {
              return;
            }
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            console.error('Realtime subscription callback error:', err);
          }
        })
        .subscribe((status) => {
          if (isMounted) {
            setIsConnected(status === 'SUBSCRIBED');
          }
        });

      channelRef.current = newChannel;
    } catch (err) {
      // Silently ignore AbortError
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Realtime subscription error:', err);
    }

    return () => {
      isMounted = false;
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // Ignore cleanup errors
        }
        channelRef.current = null;
      }
    };
  }, [options.table, options.filter, options.event]);

  return { isConnected, channel: channelRef.current };
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
