'use client';

/**
 * Route Progress Bar
 * 
 * Shows a loading bar at the top of the page during route transitions.
 * Uses Next.js router events to detect navigation.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

export function RouteProgress() {
  usePathname();
  useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let progressInterval: NodeJS.Timeout;

    // Intercept link clicks to show loading state
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (anchor) {
        const href = anchor.getAttribute('href');
        
        // Only handle internal navigation
        if (href && href.startsWith('/') && !href.startsWith('//')) {
          // Don't trigger for same-page navigation
          const currentPath = window.location.pathname + window.location.search;
          if (href !== currentPath && !anchor.hasAttribute('target')) {
            setIsLoading(true);
            setProgress(20);

            // Simulate progress
            progressInterval = setInterval(() => {
              setProgress(prev => {
                if (prev >= 90) {
                  clearInterval(progressInterval);
                  return prev;
                }
                return prev + Math.random() * 15;
              });
            }, 200);

            // Auto-complete and hide
            setTimeout(() => {
              setProgress(100);
              setTimeout(() => {
                setIsLoading(false);
                setProgress(0);
              }, 250);
            }, 900);
          }
        }
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
      if (progressInterval) clearInterval(progressInterval);
    };
  }, []);

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
