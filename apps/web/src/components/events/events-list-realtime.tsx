'use client';

import { useRouter } from 'next/navigation';

import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface EventsListRealtimeProps {
  photographerId: string;
}

export function EventsListRealtime({ photographerId }: EventsListRealtimeProps) {
  const router = useRouter();

  useRealtimeSubscription({
    table: 'events',
    filter: `photographer_id=eq.${photographerId}`,
    onChange: () => {
      router.refresh();
    },
  });

  useRealtimeSubscription({
    table: 'media',
    filter: `photographer_id=eq.${photographerId}`,
    onChange: () => {
      router.refresh();
    },
  });

  return null;
}
