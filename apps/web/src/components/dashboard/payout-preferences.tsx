'use client';

import { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CalendarDays,
  Hand,
  Loader2,
  CheckCircle,
  Bell,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';

interface PayoutSettings {
  payoutFrequency: 'instant' | 'daily' | 'weekly' | 'monthly' | 'manual';
  weeklyPayoutDay: number;
  monthlyPayoutDay: number;
  preferredCurrency: string;
  autoPayoutEnabled: boolean;
  notifyOnSale: boolean;
  notifyOnPayout: boolean;
  notifyOnThreshold: boolean;
}

const FREQUENCY_OPTIONS = [
  {
    value: 'daily',
    label: 'Daily',
    description: 'Receive payouts every day',
    icon: Clock,
  },
  {
    value: 'weekly',
    label: 'Weekly',
    description: 'Receive payouts on a specific day each week',
    icon: Calendar,
  },
  {
    value: 'monthly',
    label: 'Monthly',
    description: 'Receive payouts on a specific day each month',
    icon: CalendarDays,
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Request payouts when you want them',
    icon: Hand,
  },
];

const WEEK_DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export function PayoutPreferences() {
  const [settings, setSettings] = useState<PayoutSettings | null>(null);
  const [minimumDisplay, setMinimumDisplay] = useState('$50');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/photographer/payout-settings');
      const data = await response.json();
      
      if (response.ok) {
        setSettings(data.settings);
        setMinimumDisplay(data.minimumPayoutDisplay);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Partial<PayoutSettings>) => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/photographer/payout-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (response.ok) {
        setSettings(data.settings);
        toast.success('Settings saved');
      } else {
        toast.error('Failed to save', data.error);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Payout Frequency */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-accent/10 p-2">
            <Clock className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Payout Frequency</h3>
            <p className="text-sm text-secondary">Choose how often you receive payouts</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FREQUENCY_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = settings.payoutFrequency === option.value;

            return (
              <button
                key={option.value}
                onClick={() => saveSettings({ payoutFrequency: option.value as PayoutSettings['payoutFrequency'] })}
                disabled={saving}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50 hover:bg-muted/50'
                }`}
              >
                <div className={`rounded-lg p-2 ${isSelected ? 'bg-accent/10' : 'bg-muted'}`}>
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-accent' : 'text-secondary'}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${isSelected ? 'text-foreground' : 'text-foreground'}`}>
                      {option.label}
                    </span>
                    {isSelected && <CheckCircle className="h-4 w-4 text-accent" />}
                  </div>
                  <p className="text-xs text-secondary mt-0.5">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Weekly Day Selector */}
        {settings.payoutFrequency === 'weekly' && (
          <div className="mt-4 pt-4 border-t border-border">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Payout Day
            </label>
            <select
              value={settings.weeklyPayoutDay}
              onChange={(e) => saveSettings({ weeklyPayoutDay: Number(e.target.value) })}
              disabled={saving}
              className="w-full sm:w-auto rounded-xl border border-input bg-background px-4 py-2.5 text-sm"
            >
              {WEEK_DAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Monthly Day Selector */}
        {settings.payoutFrequency === 'monthly' && (
          <div className="mt-4 pt-4 border-t border-border">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Payout Day of Month
            </label>
            <select
              value={settings.monthlyPayoutDay}
              onChange={(e) => saveSettings({ monthlyPayoutDay: Number(e.target.value) })}
              disabled={saving}
              className="w-full sm:w-auto rounded-xl border border-input bg-background px-4 py-2.5 text-sm"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Minimum Payout Info */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl bg-success/10 p-2">
            <DollarSign className="h-5 w-5 text-success" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Minimum Payout</h3>
            <p className="text-sm text-secondary">
              Payouts are processed when your balance reaches{' '}
              <span className="font-semibold text-foreground">{minimumDisplay}</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          For scheduled payouts (daily/weekly/monthly), we&apos;ll payout any available balance regardless of minimum.
        </p>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-xl bg-accent/10 p-2">
            <Bell className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Payout Notifications</h3>
            <p className="text-sm text-secondary">Get notified about your earnings</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">New Sales</p>
              <p className="text-sm text-muted-foreground">Get notified when someone buys your photos</p>
            </div>
            <Switch
              checked={settings.notifyOnSale}
              onCheckedChange={(checked) => saveSettings({ notifyOnSale: checked })}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">Payout Sent</p>
              <p className="text-sm text-muted-foreground">Get notified when a payout is processed</p>
            </div>
            <Switch
              checked={settings.notifyOnPayout}
              onCheckedChange={(checked) => saveSettings({ notifyOnPayout: checked })}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-foreground">Threshold Reached</p>
              <p className="text-sm text-muted-foreground">Get notified when balance reaches minimum</p>
            </div>
            <Switch
              checked={settings.notifyOnThreshold}
              onCheckedChange={(checked) => saveSettings({ notifyOnThreshold: checked })}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* Auto-payout Toggle */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Automatic Payouts</h3>
            <p className="text-sm text-secondary">
              {settings.autoPayoutEnabled
                ? 'Payouts will be sent automatically based on your schedule'
                : 'Payouts are paused. You can request them manually.'}
            </p>
          </div>
          <Switch
            checked={settings.autoPayoutEnabled}
            onCheckedChange={(checked) => saveSettings({ autoPayoutEnabled: checked })}
            disabled={saving}
          />
        </div>
      </div>

      {/* Manual Request Button (if manual mode) */}
      {(settings.payoutFrequency === 'manual' || !settings.autoPayoutEnabled) && (
        <Button variant="primary" className="w-full">
          Request Payout
        </Button>
      )}
    </div>
  );
}
