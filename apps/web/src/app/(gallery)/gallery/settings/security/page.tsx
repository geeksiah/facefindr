'use client';

import { ArrowLeft, Bell, BellRing, Eye, Lock, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

interface NotificationSettings {
  photoMatches: boolean;
  newEvents: boolean;
  eventUpdates: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

const defaults: NotificationSettings = {
  photoMatches: true,
  newEvents: true,
  eventUpdates: true,
  emailNotifications: true,
  pushNotifications: false,
};

export default function SecuritySettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<keyof NotificationSettings | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/attendee/notification-settings', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        if (!active) return;
        setSettings({
          photoMatches: Boolean(data.photoMatches ?? defaults.photoMatches),
          newEvents: Boolean(data.newEvents ?? defaults.newEvents),
          eventUpdates: Boolean(data.eventUpdates ?? defaults.eventUpdates),
          emailNotifications: Boolean(data.emailNotifications ?? defaults.emailNotifications),
          pushNotifications: Boolean(data.pushNotifications ?? defaults.pushNotifications),
        });
      } catch (error) {
        console.error('Security settings load error:', error);
        toast.error('Load failed', 'Could not load notification security settings.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [toast]);

  async function updateSetting(key: keyof NotificationSettings, value: boolean) {
    const previous = { ...settings };
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingKey(key);

    try {
      const res = await fetch('/api/attendee/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save setting');
      }
    } catch (error) {
      console.error('Security settings update error:', error);
      setSettings(previous);
      toast.error('Save failed', 'Could not update this setting.');
    } finally {
      setSavingKey(null);
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
          <h1 className="text-2xl font-bold text-foreground">Security Settings</h1>
          <p className="text-secondary">Control alert channels and account safety preferences.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <BellRing className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Photo Match Alerts</p>
              <p className="text-sm text-secondary">Get notified when new photos match your face.</p>
            </div>
          </div>
          <Switch
            checked={settings.photoMatches}
            disabled={loading || savingKey === 'photoMatches'}
            onCheckedChange={(checked) => updateSetting('photoMatches', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Event Alerts</p>
              <p className="text-sm text-secondary">Receive creator event announcements.</p>
            </div>
          </div>
          <Switch
            checked={settings.newEvents}
            disabled={loading || savingKey === 'newEvents'}
            onCheckedChange={(checked) => updateSetting('newEvents', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Order/Delivery Updates</p>
              <p className="text-sm text-secondary">Track processing and delivery related changes.</p>
            </div>
          </div>
          <Switch
            checked={settings.eventUpdates}
            disabled={loading || savingKey === 'eventUpdates'}
            onCheckedChange={(checked) => updateSetting('eventUpdates', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Email Notifications</p>
              <p className="text-sm text-secondary">Receive account and security notifications by email.</p>
            </div>
          </div>
          <Switch
            checked={settings.emailNotifications}
            disabled={loading || savingKey === 'emailNotifications'}
            onCheckedChange={(checked) => updateSetting('emailNotifications', checked)}
          />
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-secondary" />
            <div>
              <p className="font-medium text-foreground">Push Notifications</p>
              <p className="text-sm text-secondary">Allow push alerts on supported devices.</p>
            </div>
          </div>
          <Switch
            checked={settings.pushNotifications}
            disabled={loading || savingKey === 'pushNotifications'}
            onCheckedChange={(checked) => updateSetting('pushNotifications', checked)}
          />
        </div>
      </div>
    </div>
  );
}
