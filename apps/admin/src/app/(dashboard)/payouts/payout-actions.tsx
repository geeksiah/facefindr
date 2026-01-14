'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  RefreshCw, 
  Pause, 
  Play, 
  Loader2,
  Zap,
  AlertTriangle,
} from 'lucide-react';

interface PayoutActionsProps {
  payoutsEnabled: boolean;
}

export function PayoutActions({ payoutsEnabled }: PayoutActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setIsLoading(action);
    try {
      const response = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Retry Failed */}
      <button
        onClick={() => handleAction('retry-failed')}
        disabled={isLoading !== null}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
      >
        {isLoading === 'retry-failed' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">Retry Failed</span>
      </button>

      {/* Process All */}
      <button
        onClick={() => handleAction('batch-threshold')}
        disabled={isLoading !== null}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
      >
        {isLoading === 'batch-threshold' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">Process Eligible</span>
      </button>

      {/* Toggle Payouts */}
      <button
        onClick={() => handleAction(payoutsEnabled ? 'pause' : 'resume')}
        disabled={isLoading !== null}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
          payoutsEnabled
            ? 'bg-yellow-500 text-black hover:bg-yellow-400'
            : 'bg-green-500 text-white hover:bg-green-400'
        }`}
      >
        {isLoading === 'pause' || isLoading === 'resume' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : payoutsEnabled ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {payoutsEnabled ? 'Pause Payouts' : 'Resume Payouts'}
      </button>
    </div>
  );
}
