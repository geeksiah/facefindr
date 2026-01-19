'use client';

import { Radio, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LiveModeToggleProps {
  eventId: string;
  initialEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  className?: string;
}

export function LiveModeToggle({
  eventId,
  initialEnabled = false,
  onToggle,
  className,
}: LiveModeToggleProps) {
  const [isLive, setIsLive] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current status on mount
    fetchStatus();
  }, [eventId]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/live-mode`);
      if (response.ok) {
        const data = await response.json();
        setIsLive(data.liveModeEnabled);
      }
    } catch (err) {
      console.error('Failed to fetch live mode status:', err);
    }
  };

  const toggleLiveMode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/live-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isLive }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to toggle live mode');
      }

      const data = await response.json();
      setIsLive(data.liveModeEnabled);
      onToggle?.(data.liveModeEnabled);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        variant={isLive ? 'default' : 'outline'}
        size="lg"
        onClick={toggleLiveMode}
        disabled={isLoading}
        className={cn(
          'relative transition-all duration-300',
          isLive && 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
        )}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        ) : isLive ? (
          <>
            <Radio className="h-5 w-5 mr-2" />
            <span className="relative">
              LIVE
              <span className="absolute -top-1 -right-3 h-2 w-2 rounded-full bg-white animate-ping" />
            </span>
          </>
        ) : (
          <>
            <WifiOff className="h-5 w-5 mr-2" />
            Go Live
          </>
        )}
      </Button>
      
      <p className="text-xs text-muted-foreground text-center">
        {isLive 
          ? 'Attendees receive notifications within 5 minutes'
          : 'Enable for real-time photo notifications'
        }
      </p>
      
      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
