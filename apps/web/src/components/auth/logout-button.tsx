'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useConfirm } from '@/components/ui/toast';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface LogoutButtonProps {
  className?: string;
  showIcon?: boolean;
  showLabel?: boolean;
  label?: string;
}

export function LogoutButton({
  className,
  showIcon = true,
  showLabel = true,
  label = 'Sign Out',
}: LogoutButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  const toast = useToast();

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out? Any unsaved changes will be lost.',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Stay',
      variant: 'destructive',
    });

    if (confirmed) {
      setIsLoading(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let redirectTo = '/login';
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        redirectTo = data?.redirectTo || '/login';
        toast.success('Signed out', 'You have been signed out.');
      } catch (error) {
        console.error('Logout error:', error);
        toast.info('Signed out', 'Session ended. Redirecting to login.');
      } finally {
        clearTimeout(timeout);
        try {
          const channel = new BroadcastChannel('auth');
          channel.postMessage({ type: 'signed_out' });
          channel.close();
        } catch {}
        router.replace(redirectTo);
        router.refresh();
        setIsLoading(false);
      }
    }
  };

  return (
    <>
      <button
        onClick={handleLogout}
        disabled={isLoading}
        className={cn(
          'flex items-center gap-3 text-sm font-medium text-secondary transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50',
          className
        )}
      >
        {showIcon && <LogOut className="h-5 w-5" />}
        {showLabel && <span>{isLoading ? 'Signing out...' : label}</span>}
      </button>
      <ConfirmDialog />
    </>
  );
}
