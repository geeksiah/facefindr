'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export function OfflineDetector() {
  const [isOffline, setIsOffline] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Check initial state
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      setIsOffline(false);
      setIsReconnecting(false);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setIsReconnecting(true);
    
    try {
      // Try to fetch a small resource to check connectivity
      await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
      setIsOffline(false);
    } catch {
      // Still offline
    } finally {
      setIsReconnecting(false);
    }
  };

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[200] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 m-0">
      <div className="max-w-sm w-full text-center">
        {/* Illustration */}
        <div className="relative mx-auto w-40 h-40 mb-8">
          <svg
            viewBox="0 0 160 160"
            className="w-full h-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Cloud */}
            <path
              d="M120 90 C135 90 145 80 145 65 C145 50 135 40 120 40 C118 40 116 40 114 41 C110 25 95 15 78 15 C58 15 42 30 40 50 C25 52 15 65 15 80 C15 95 27 105 45 105 L120 105 C130 105 140 98 140 90"
              className="fill-muted stroke-border"
              strokeWidth="2"
            />
            
            {/* Wifi icon with X */}
            <g transform="translate(55, 50)">
              {/* Wifi arcs */}
              <path
                d="M25 35 C15 25 5 30 0 35"
                className="stroke-secondary"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                opacity="0.3"
              />
              <path
                d="M25 25 C10 10 -5 20 -10 25"
                className="stroke-secondary"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                opacity="0.3"
              />
              <path
                d="M25 15 C5 -5 -15 10 -20 15"
                className="stroke-secondary"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                opacity="0.3"
              />
              
              {/* X mark */}
              <line
                x1="5"
                y1="10"
                x2="45"
                y2="50"
                className="stroke-destructive"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <line
                x1="45"
                y1="10"
                x2="5"
                y2="50"
                className="stroke-destructive"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </g>
          </svg>
        </div>

        {/* Content */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <WifiOff className="h-5 w-5 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">You&apos;re Offline</h1>
        </div>
        <p className="text-secondary mb-8">
          Please check your internet connection and try again. Some features may not be available while offline.
        </p>

        {/* Retry button */}
        <button
          onClick={handleRetry}
          disabled={isReconnecting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isReconnecting ? 'animate-spin' : ''}`} />
          {isReconnecting ? 'Checking...' : 'Try Again'}
        </button>

        {/* Tips */}
        <div className="mt-8 p-4 rounded-xl bg-muted text-left">
          <p className="text-sm font-medium text-foreground mb-2">Troubleshooting tips:</p>
          <ul className="text-sm text-secondary space-y-1">
            <li>Check if your Wi-Fi or mobile data is enabled</li>
            <li>Try moving closer to your router</li>
            <li>Restart your router or modem</li>
            <li>Check if other apps can connect</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
