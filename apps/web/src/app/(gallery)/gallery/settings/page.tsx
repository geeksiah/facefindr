'use client';

import {
  Shield,
  Trash2,
  Download,
  LogOut,
  ChevronRight,
  AlertTriangle,
  Lock,
  Eye,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { logout } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
  const router = useRouter();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showDeleteFace, setShowDeleteFace] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    allowTagging: true,
    publicProfile: false,
    showInSearch: true,
  });

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleDeleteFaceData = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/attendee/face-profile', {
        method: 'DELETE',
      });
      if (response.ok) {
        setShowDeleteFace(false);
        // Optionally show success message
      }
    } catch (error) {
      console.error('Failed to delete face data:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/attendee/account', {
        method: 'DELETE',
      });
      if (response.ok) {
        await logout();
        router.push('/');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/attendee/export');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ferchr-data-export.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const updatePrivacySetting = async (key: keyof typeof privacySettings, value: boolean) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: value }));
    try {
      await fetch('/api/attendee/privacy-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (error) {
      console.error('Failed to update privacy setting:', error);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-secondary mt-1">Manage your privacy and account settings</p>
      </div>

      {/* Privacy Settings */}
      <div>
        <h2 className="text-sm font-medium text-secondary mb-3 px-1">Privacy</h2>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-secondary" />
              <div>
                <p className="font-medium text-foreground">Allow Photo Tagging</p>
                <p className="text-sm text-secondary">
                  Creators can match your face in their photos
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.allowTagging}
              onCheckedChange={(checked) => updatePrivacySetting('allowTagging', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <UserX className="h-5 w-5 text-secondary" />
              <div>
                <p className="font-medium text-foreground">Public Profile</p>
                <p className="text-sm text-secondary">
                  Others can see your profile and FaceTag
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.publicProfile}
              onCheckedChange={(checked) => updatePrivacySetting('publicProfile', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-secondary" />
              <div>
                <p className="font-medium text-foreground">Appear in Search</p>
                <p className="text-sm text-secondary">
                  Creators can find you by FaceTag
                </p>
              </div>
            </div>
            <Switch
              checked={privacySettings.showInSearch}
              onCheckedChange={(checked) => updatePrivacySetting('showInSearch', checked)}
            />
          </div>
        </div>
      </div>

      {/* Security */}
      <div>
        <h2 className="text-sm font-medium text-secondary mb-3 px-1">Security</h2>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          <Link
            href="/gallery/settings/change-password"
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-secondary" />
              <span className="font-medium text-foreground">Change Password</span>
            </div>
            <ChevronRight className="h-4 w-4 text-secondary" />
          </Link>
          <Link
            href="/gallery/settings/security"
            className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-secondary" />
              <span className="font-medium text-foreground">Security Settings</span>
            </div>
            <ChevronRight className="h-4 w-4 text-secondary" />
          </Link>
        </div>
      </div>

      {/* Data Management */}
      <div>
        <h2 className="text-sm font-medium text-secondary mb-3 px-1">Data Management</h2>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          <button
            onClick={handleExportData}
            className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-secondary" />
              <div className="text-left">
                <p className="font-medium text-foreground">Export My Data</p>
                <p className="text-sm text-secondary">Download all your data</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-secondary" />
          </button>
          <button
            onClick={() => setShowDeleteFace(true)}
            className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-warning" />
              <div className="text-left">
                <p className="font-medium text-foreground">Delete Face Data</p>
                <p className="text-sm text-secondary">Remove your face profile</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-secondary" />
          </button>
        </div>
      </div>

      {/* Account Actions */}
      <div>
        <h2 className="text-sm font-medium text-secondary mb-3 px-1">Account</h2>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 p-4 transition-colors hover:bg-muted/50"
          >
            <LogOut className="h-5 w-5 text-secondary" />
            <span className="font-medium text-foreground">Sign Out</span>
          </button>
          <button
            onClick={() => setShowDeleteAccount(true)}
            className="flex w-full items-center gap-3 p-4 transition-colors hover:bg-destructive/5"
          >
            <Trash2 className="h-5 w-5 text-destructive" />
            <span className="font-medium text-destructive">Delete Account</span>
          </button>
        </div>
      </div>

      {/* Delete Face Data Modal */}
      {showDeleteFace && (
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
          <div className="w-full max-w-md rounded-2xl bg-card p-6 space-y-4 mx-4 my-4">
            <div className="flex items-center gap-3 text-warning">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-foreground">Delete Face Data?</h3>
            </div>
            <p className="text-sm text-secondary">
              This will permanently remove your face profile from our system. You won&apos;t be
              able to automatically find photos until you scan your face again.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowDeleteFace(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-warning hover:bg-warning/90"
                onClick={handleDeleteFaceData}
                isLoading={isDeleting}
              >
                Delete Face Data
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteAccount && (
        <div 
          className="fixed z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
          <div className="w-full max-w-md rounded-2xl bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-semibold text-foreground">Delete Account?</h3>
            </div>
            <p className="text-sm text-secondary">
              This action is permanent and cannot be undone. All your data including photos,
              purchases, and face profile will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowDeleteAccount(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-destructive hover:bg-destructive/90"
                onClick={handleDeleteAccount}
                isLoading={isDeleting}
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

