'use client';

import { ArrowLeft, Lock, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

export default function ChangePasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Missing fields', 'Please complete all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Password mismatch', 'New password and confirm password must match.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Weak password', 'New password must be at least 8 characters.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error('Password update failed', data?.error || 'Unable to change password.');
        return;
      }

      toast.success('Password updated', 'Your password has been changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      router.push('/gallery/settings');
    } catch (error) {
      console.error('Change password error:', error);
      toast.error('Request failed', 'Could not change password right now.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Change Password</h1>
          <p className="text-secondary">Update your account password securely.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Current Password</label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">New Password</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Confirm New Password</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="pt-2">
          <Button type="submit" isLoading={isSaving}>
            {isSaving ? (
              'Saving...'
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Password
              </>
            )}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-secondary">
        <p className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Use a strong password with at least 8 characters.
        </p>
      </div>
    </div>
  );
}
