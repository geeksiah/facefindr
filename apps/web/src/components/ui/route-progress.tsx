'use client';

/**
 * Route Progress Bar
 * 
 * Shows a loading bar at the top of the page during route transitions.
 * Uses Next.js router events to detect navigation.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUrl = useMemo(() => {
    const query = searchParams?.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  const stopTimers = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const finish = () => {
    stopTimers();
    setProgress(100);
    window.setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
      setTargetUrl(null);
    }, 180);
  };

  const start = (nextUrl: string) => {
    if (!nextUrl || nextUrl === currentUrl) return;
    stopTimers();
    setTargetUrl(nextUrl);
    setIsLoading(true);
    setProgress(14);
    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        const step = prev < 45 ? 9 : prev < 75 ? 4 : 2;
        return Math.min(prev + step, 92);
      });
    }, 120);
    safetyTimerRef.current = setTimeout(() => {
      finish();
    }, 15000);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (anchor) {
        if (anchor.hasAttribute('target') || anchor.hasAttribute('download')) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        const next = new URL(href, window.location.origin);
        if (next.origin !== window.location.origin) return;
        start(`${next.pathname}${next.search}`);
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
      stopTimers();
    };
  }, [currentUrl]);

  useEffect(() => {
    if (!isLoading || !targetUrl) return;
    if (currentUrl === targetUrl) {
      finish();
    }
  }, [isLoading, targetUrl, currentUrl]);

  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-transparent">
      <div
        className={cn(
          'h-full bg-accent transition-all duration-300 ease-out',
          'shadow-[0_0_10px_var(--accent),0_0_5px_var(--accent)]'
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
