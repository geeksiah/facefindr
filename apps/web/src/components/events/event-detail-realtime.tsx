'use client';

import { useRouter } from 'next/navigation';

import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface EventDetailRealtimeProps {
  eventId: string;
}

/**
 * Client component to handle realtime updates for event detail page
 * Subscribes to event changes to update visibility and other settings in real-time
 */
export function EventDetailRealtime({ eventId }: EventDetailRealtimeProps) {
  const router = useRouter();

  // Subscribe to event updates for real-time visibility changes
  useRealtimeSubscription({
    table: 'events',
    filter: `id=eq.${eventId}`,
    onChange: () => {
      // Refresh page when event is updated (visibility, settings, etc.)
      router.refresh();
    },
  });

  return null; // This component doesn't render anything
}
