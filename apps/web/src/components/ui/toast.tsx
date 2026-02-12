'use client';

import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

// Toast types
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  readonly children: ReactNode;
}

export function ToastProvider({ children }: Readonly<ToastProviderProps>) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast = { ...toast, id };
      
      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after duration
      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'success', title, message });
    },
    [addToast]
  );

  const error = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'error', title, message, duration: 8000 });
    },
    [addToast]
  );

  const warning = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'warning', title, message });
    },
    [addToast]
  );

  const info = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'info', title, message });
    },
    [addToast]
  );

  const value = useMemo(
    () => ({ toasts, addToast, removeToast, success, error, warning, info }),
    [toasts, addToast, removeToast, success, error, warning, info]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast Container
interface ToastContainerProps {
  readonly toasts: Toast[];
  readonly removeToast: (id: string) => void;
}

function ToastContainer({ toasts, removeToast }: Readonly<ToastContainerProps>) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// Individual Toast
interface ToastItemProps {
  readonly toast: Toast;
  readonly onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: Readonly<ToastItemProps>) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const colors = {
    success: {
      bg: 'bg-success/10 dark:bg-success/20',
      border: 'border-success/20',
      icon: 'text-success',
    },
    error: {
      bg: 'bg-destructive/10 dark:bg-destructive/20',
      border: 'border-destructive/20',
      icon: 'text-destructive',
    },
    warning: {
      bg: 'bg-warning/10 dark:bg-warning/20',
      border: 'border-warning/20',
      icon: 'text-warning',
    },
    info: {
      bg: 'bg-accent/10 dark:bg-accent/20',
      border: 'border-accent/20',
      icon: 'text-accent',
    },
  };

  const Icon = icons[toast.type];
  const color = colors[toast.type];

  return (
    <div
      className={`pointer-events-auto animate-in slide-in-from-right-full fade-in duration-300 rounded-xl border ${color.border} ${color.bg} p-4 shadow-lg backdrop-blur-sm`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 flex-shrink-0 ${color.icon}`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{toast.title}</p>
          {toast.message && (
            <p className="mt-1 text-sm text-secondary">{toast.message}</p>
          )}
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 rounded-lg p-1 hover:bg-foreground/5 transition-colors"
        >
          <X className="h-4 w-4 text-secondary" />
        </button>
      </div>
    </div>
  );
}

// Confirmation Dialog (replaces window.confirm)
interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'destructive';
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  if (!isOpen) return null;
  return (
    <div
      className="z-[100] flex items-center justify-center"
      style={{
        position: 'fixed',
        inset: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100dvw',
        height: '100dvh',
        margin: 0,
        padding: 0,
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        style={{
          position: 'absolute',
          inset: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          backgroundColor: 'transparent',
        }}
        aria-label="Close dialog"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-2xl shadow-xl max-w-sm w-full p-6 mx-4 animate-in zoom-in-95 fade-in duration-200">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-secondary">{message}</p>
        
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors ${
              variant === 'destructive'
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-accent hover:bg-accent/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for confirmation dialogs
interface UseConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

export function useConfirm() {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    options: UseConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    options: { title: '', message: '' },
    resolve: null,
  });

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    dialogState.resolve?.(true);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  const handleCancel = () => {
    dialogState.resolve?.(false);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  function ConfirmDialogComponent() {
    return (
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.options.title}
        message={dialogState.options.message}
        confirmLabel={dialogState.options.confirmLabel}
        cancelLabel={dialogState.options.cancelLabel}
        variant={dialogState.options.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
}
