'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Hook to warn users about unsaved changes when navigating away
 * 
 * Usage:
 * const { setHasChanges, confirmNavigation, UnsavedChangesDialog } = useUnsavedChanges();
 * 
 * // Mark form as dirty
 * setHasChanges(true);
 * 
 * // Check before programmatic navigation
 * const canNavigate = await confirmNavigation();
 * if (canNavigate) router.push('/somewhere');
 */
export function useUnsavedChanges(message?: string) {
  const [hasChanges, setHasChanges] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  const defaultMessage = message || 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.';

  // Browser beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = defaultMessage;
        return defaultMessage;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges, defaultMessage]);

  // Confirm navigation programmatically
  const confirmNavigation = useCallback((): Promise<boolean> => {
    if (!hasChanges) return Promise.resolve(true);

    return new Promise((resolve) => {
      setShowDialog(true);
      setPendingNavigation(() => () => resolve(true));
      // If dialog is cancelled, resolve false
      const checkClosed = setInterval(() => {
        if (!showDialog) {
          clearInterval(checkClosed);
          resolve(false);
        }
      }, 100);
    });
  }, [hasChanges, showDialog]);

  const handleConfirm = useCallback(() => {
    setShowDialog(false);
    setHasChanges(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  }, [pendingNavigation]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setPendingNavigation(null);
  }, []);

  // Dialog component
  const UnsavedChangesDialog = showDialog ? (
    <div 
      className="z-[100] flex items-center justify-center"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: '1rem',
      }}
    >
      <div
        className="bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        style={{ position: 'absolute', inset: 0 }}
        onClick={handleCancel}
      />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95 fade-in duration-200">
        <h3 className="text-lg font-semibold text-foreground">Unsaved Changes</h3>
        <p className="mt-2 text-sm text-secondary">{defaultMessage}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
          >
            Stay
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
          >
            Leave Anyway
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    hasChanges,
    setHasChanges,
    confirmNavigation,
    UnsavedChangesDialog,
  };
}
