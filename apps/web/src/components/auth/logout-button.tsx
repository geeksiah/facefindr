'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useConfirm } from '@/components/ui/toast';
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
      try {
        // Use the API route for logout
        await fetch('/api/auth/logout', { method: 'GET' });
        router.push('/');
        router.refresh();
      } catch (error) {
        console.error('Logout error:', error);
      } finally {
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
      {ConfirmDialog}
    </>
  );
}
