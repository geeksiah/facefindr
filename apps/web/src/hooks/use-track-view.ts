'use client';

import { useEffect, useCallback, useRef } from 'react';

type ViewType = 'photo' | 'event' | 'profile' | 'gallery';

interface UseTrackViewOptions {
  viewType: ViewType;
  eventId?: string;
  mediaId?: string;
  photographerId?: string;
  enabled?: boolean;
}

/**
 * Hook to track page/photo views
 * 
 * Usage:
 * useTrackView({ viewType: 'event', eventId: '123' });
 */
export function useTrackView(options: UseTrackViewOptions) {
  const { viewType, eventId, mediaId, photographerId, enabled = true } = options;
  const hasTracked = useRef(false);

  const trackView = useCallback(async () => {
    if (!enabled || hasTracked.current) return;
    
    hasTracked.current = true;

    try {
      // Generate or get session ID
      let sessionId = sessionStorage.getItem('analytics_session');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('analytics_session', sessionId);
      }

      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewType,
          eventId,
          mediaId,
          photographerId,
          sessionId,
        }),
      });
    } catch (error) {
      // Silently fail - analytics shouldn't break the app
      console.error('Failed to track view:', error);
    }
  }, [viewType, eventId, mediaId, photographerId, enabled]);

  useEffect(() => {
    trackView();
  }, [trackView]);

  return { trackView };
}

/**
 * Track a single view imperatively
 */
export async function trackViewEvent(options: {
  viewType: ViewType;
  eventId?: string;
  mediaId?: string;
  photographerId?: string;
}) {
  try {
    let sessionId = sessionStorage.getItem('analytics_session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('analytics_session', sessionId);
    }

    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...options,
        sessionId,
      }),
    });
  } catch (error) {
    console.error('Failed to track view:', error);
  }
}
