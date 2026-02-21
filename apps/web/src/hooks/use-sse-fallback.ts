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
  const sseEnabled = process.env.NEXT_PUBLIC_ENABLE_SSE_STREAMS !== 'false';
  const lastMessageAtRef = useRef<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthRef = useRef<'healthy' | 'stale'>('stale');
  const onMessageRef = useRef(onMessage);
  const onPollRef = useRef(onPoll);
  const onErrorRef = useRef(onError);
  const pollInFlightRef = useRef(false);
  const pollQueuedRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const runPoll = useCallback(async () => {
    if (pollInFlightRef.current) {
      pollQueuedRef.current = true;
      return;
    }

    pollInFlightRef.current = true;
    try {
      let shouldContinue = true;
      while (shouldContinue) {
        pollQueuedRef.current = false;
        try {
          await onPollRef.current();
        } catch (error) {
          onErrorRef.current?.(error);
        }
        shouldContinue = pollQueuedRef.current;
      }
    } finally {
      pollInFlightRef.current = false;
    }
  }, []);

  const schedulePolling = useCallback(() => {
    clearPolling();

    const run = async () => {
      await runPoll();
      pollingRef.current = setTimeout(run, withJitter(pollIntervalMs));
    };

    pollingRef.current = setTimeout(run, withJitter(pollIntervalMs));
  }, [clearPolling, pollIntervalMs, runPoll]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let streamErrorCount = 0;
    lastMessageAtRef.current = Date.now();
    healthRef.current = 'stale';
    pollQueuedRef.current = false;

    // Always do an immediate poll for initial correctness.
    void runPoll();
    schedulePolling();

    if (!sseEnabled) {
      return () => {
        cancelled = true;
        clearPolling();
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
      };
    }

    try {
      const resolvedUrl = (() => {
        try {
          if (typeof window === 'undefined') return url;
          return new URL(url, window.location.origin).toString();
        } catch (error) {
          onErrorRef.current?.(error);
          return null;
        }
      })();

      if (!resolvedUrl) {
        return () => {
          cancelled = true;
          clearPolling();
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        };
      }

      const es = new EventSource(resolvedUrl);
      eventSourceRef.current = es;

      const markHealthy = () => {
        lastMessageAtRef.current = Date.now();
        healthRef.current = 'healthy';
        streamErrorCount = 0;
      };

      es.addEventListener('ready', markHealthy);
      es.addEventListener(eventName, (event) => {
        markHealthy();
        try {
          const parsed = JSON.parse((event as MessageEvent).data) as T;
          onMessageRef.current(parsed);
        } catch (error) {
          onErrorRef.current?.(error);
        }
      });

      es.onerror = (error) => {
        healthRef.current = 'stale';
        streamErrorCount += 1;
        // Stop SSE after repeated failures and rely on polling fallback.
        if (streamErrorCount >= 3) {
          es.close();
          eventSourceRef.current = null;
        }
        onErrorRef.current?.(error);
      };
    } catch (error) {
      onErrorRef.current?.(error);
    }

    const healthCheck = setInterval(() => {
      if (cancelled) return;
      if (Date.now() - lastMessageAtRef.current > heartbeatTimeoutMs) {
        healthRef.current = 'stale';
        void runPoll();
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
    runPoll,
    schedulePolling,
    sseEnabled,
    url,
  ]);
}
