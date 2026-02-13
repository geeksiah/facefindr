import { useCallback, useEffect, useRef } from 'react';

interface UseSSEWithPollingOptions<T> {
  url: string;
  eventName: string;
  enabled?: boolean;
  heartbeatTimeoutMs?: number;
  pollIntervalMs?: number;
  onMessage: (payload: T) => void;
  onPoll: () => Promise<void>;
  onError?: (error: unknown) => void;
}

function withJitter(baseMs: number) {
  const jitter = Math.floor(Math.random() * Math.min(2000, Math.max(250, baseMs * 0.25)));
  return baseMs + jitter;
}

export function useSSEWithPolling<T>({
  url,
  eventName,
  enabled = true,
  heartbeatTimeoutMs = 30000,
  pollIntervalMs = 15000,
  onMessage,
  onPoll,
  onError,
}: UseSSEWithPollingOptions<T>) {
  const lastMessageAtRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const healthRef = useRef<'healthy' | 'stale'>('stale');

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const schedulePolling = useCallback(() => {
    clearPolling();

    const run = async () => {
      try {
        await onPoll();
      } catch (error) {
        onError?.(error);
      } finally {
        pollingRef.current = setTimeout(run, withJitter(pollIntervalMs));
      }
    };

    pollingRef.current = setTimeout(run, withJitter(pollIntervalMs));
  }, [clearPolling, onError, onPoll, pollIntervalMs]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    lastMessageAtRef.current = Date.now();
    healthRef.current = 'stale';

    // Always do an immediate poll for initial correctness.
    void onPoll().catch((error) => onError?.(error));
    schedulePolling();

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      const markHealthy = () => {
        lastMessageAtRef.current = Date.now();
        healthRef.current = 'healthy';
      };

      es.addEventListener('ready', markHealthy);
      es.addEventListener(eventName, (event) => {
        markHealthy();
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as T;
          onMessage(parsed);
        } catch (error) {
          onError?.(error);
        }
      });

      es.onerror = (error) => {
        healthRef.current = 'stale';
        onError?.(error);
      };
    } catch (error) {
      onError?.(error);
    }

    const healthCheck = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastMessageAtRef.current > heartbeatTimeoutMs) {
        healthRef.current = 'stale';
        void onPoll().catch((error) => onError?.(error));
      }
    }, Math.min(heartbeatTimeoutMs, 15000));

    return () => {
      cancelled = true;
      clearInterval(healthCheck);
      clearPolling();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [
    clearPolling,
    enabled,
    eventName,
    heartbeatTimeoutMs,
    onError,
    onMessage,
    onPoll,
    schedulePolling,
    url,
  ]);
}

