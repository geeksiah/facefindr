/**
 * Realtime Subscription Hooks for Web
 * 
 * Provides easy-to-use hooks for subscribing to database changes.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useState, useRef } from 'react';

import { createClient } from '@/lib/supabase/client';

type TableName = string;
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
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastErrorLogAtRef = useRef(0);

  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    const { table, event = '*', filter } = options;
    const supabase = createClient();
    const logCooldownMs = 30000;

    const logWithCooldown = (message: string, error?: unknown) => {
      const now = Date.now();
      if (now - lastErrorLogAtRef.current < logCooldownMs) return;
      lastErrorLogAtRef.current = now;
      if (error) {
        console.error(message, error);
      } else {
        console.error(message);
      }
    };

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimerRef.current) return;
      const nextAttempt = Math.min(reconnectAttemptsRef.current + 1, 6);
      reconnectAttemptsRef.current = nextAttempt;
      const delayMs = Math.min(30000, Math.pow(2, nextAttempt - 1) * 1000);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        setReconnectNonce((value) => value + 1);
      }, delayMs);
    };

    const channelConfig = {
      event,
      schema: 'public',
      table,
      ...(filter && { filter }),
    };

    let isMounted = true;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsConnected(false);
      const handleOnline = () => {
        if (!isMounted) return;
        reconnectAttemptsRef.current = 0;
        setReconnectNonce((value) => value + 1);
      };
      window.addEventListener('online', handleOnline);
      return () => {
        isMounted = false;
        window.removeEventListener('online', handleOnline);
        clearReconnectTimer();
      };
    }

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
            if (status === 'SUBSCRIBED') {
              reconnectAttemptsRef.current = 0;
              setIsConnected(true);
              return;
            }

            setIsConnected(false);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              if (channelRef.current === newChannel) {
                try {
                  supabase.removeChannel(newChannel);
                } catch {
                  // ignore cleanup errors
                }
                channelRef.current = null;
                setChannel(null);
              }
              scheduleReconnect();
            }
          }
        });

      channelRef.current = newChannel;
      setChannel(newChannel);
    } catch (err) {
      // Silently ignore AbortError
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      logWithCooldown('Realtime subscription error:', err);
      scheduleReconnect();
    }

    return () => {
      isMounted = false;
      clearReconnectTimer();
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // Ignore cleanup errors
        }
        channelRef.current = null;
        setChannel(null);
      }
    };
  }, [options.table, options.filter, options.event, reconnectNonce]);

  return { isConnected, channel };
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
