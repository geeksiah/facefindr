'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore, useCallback } from 'react';

// External store for progress state to avoid setState in effects
let progressValue = 0;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return progressValue;
}

function setProgressValue(value: number) {
  progressValue = value;
  listeners.forEach((listener) => listener());
}

export function LoadingProgress() {
  const pathname = usePathname();
  const safePathname = pathname ?? '';
  const searchParams = useSearchParams();
  const progress = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const startLoading = useCallback(() => {
    // Clear any existing timers
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Start loading
    setProgressValue(10);

    // Simulate progress
    timersRef.current.push(setTimeout(() => setProgressValue(30), 100));
    timersRef.current.push(setTimeout(() => setProgressValue(60), 200));
    timersRef.current.push(setTimeout(() => setProgressValue(80), 400));
    timersRef.current.push(setTimeout(() => {
      setProgressValue(100);
      timersRef.current.push(setTimeout(() => {
        setProgressValue(0);
      }, 200));
    }, 500));
  }, []);

  useEffect(() => {
    startLoading();

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [pathname, searchParams, startLoading]);

  if (progress === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(14,165,233,0.7)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}


