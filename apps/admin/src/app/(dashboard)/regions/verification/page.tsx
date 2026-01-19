'use client';

import {
  ArrowLeft,
  Save,
  Loader2,
  Mail,
  Phone,
  Shield,
  Check,
  Clock,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

interface VerificationSettings {
  id: string;
  email_verification_enabled: boolean;
  email_verification_required_photographers: boolean;
  email_verification_required_attendees: boolean;
  email_verification_expiry_hours: number;
  phone_verification_enabled: boolean;
  phone_verification_required_photographers: boolean;
  phone_verification_required_attendees: boolean;
  phone_verification_expiry_minutes: number;
  phone_verification_max_attempts: number;
  phone_verification_cooldown_minutes: number;
  otp_length: number;
  otp_type: 'numeric' | 'alphanumeric';
  max_verifications_per_day: number;
}

export default function VerificationSettingsPage() {
  const [settings, setSettings] = useState<VerificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const response = await fetch('/api/admin/regions/verification');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
      setIsLoading(false);
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/regions/verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return <div className="text-center py-12 text-muted-foreground">Failed to load settings</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/regions" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Verification Settings</h1>
            <p className="text-muted-foreground">Configure phone and email verification globally</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-green-500 text-sm flex items-center gap-1">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Email Verification */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Verification
          </h2>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.email_verification_enabled}
              onChange={(e) => setSettings({ ...settings, email_verification_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Required for Photographers</p>
                <p className="text-sm text-muted-foreground">Must verify email to access platform</p>
              </div>
              <input
                type="checkbox"
                checked={settings.email_verification_required_photographers}
                onChange={(e) => setSettings({ ...settings, email_verification_required_photographers: e.target.checked })}
                disabled={!settings.email_verification_enabled}
                className="rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Required for Attendees</p>
                <p className="text-sm text-muted-foreground">Must verify email to access platform</p>
              </div>
              <input
                type="checkbox"
                checked={settings.email_verification_required_attendees}
                onChange={(e) => setSettings({ ...settings, email_verification_required_attendees: e.target.checked })}
                disabled={!settings.email_verification_enabled}
                className="rounded"
              />
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Link Expiry (hours)
            </label>
            <input
              type="number"
              value={settings.email_verification_expiry_hours}
              onChange={(e) => setSettings({ ...settings, email_verification_expiry_hours: parseInt(e.target.value) })}
              min={1}
              max={72}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Phone Verification */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-5 w-5" /> Phone Verification (OTP)
          </h2>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.phone_verification_enabled}
              onChange={(e) => setSettings({ ...settings, phone_verification_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Required for Photographers</p>
                <p className="text-sm text-muted-foreground">Must verify phone to access platform</p>
              </div>
              <input
                type="checkbox"
                checked={settings.phone_verification_required_photographers}
                onChange={(e) => setSettings({ ...settings, phone_verification_required_photographers: e.target.checked })}
                disabled={!settings.phone_verification_enabled}
                className="rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Required for Attendees</p>
                <p className="text-sm text-muted-foreground">Must verify phone to access platform</p>
              </div>
              <input
                type="checkbox"
                checked={settings.phone_verification_required_attendees}
                onChange={(e) => setSettings({ ...settings, phone_verification_required_attendees: e.target.checked })}
                disabled={!settings.phone_verification_enabled}
                className="rounded"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> OTP Expiry (minutes)
              </label>
              <input
                type="number"
                value={settings.phone_verification_expiry_minutes}
                onChange={(e) => setSettings({ ...settings, phone_verification_expiry_minutes: parseInt(e.target.value) })}
                min={1}
                max={30}
                className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Max Attempts
              </label>
              <input
                type="number"
                value={settings.phone_verification_max_attempts}
                onChange={(e) => setSettings({ ...settings, phone_verification_max_attempts: parseInt(e.target.value) })}
                min={1}
                max={10}
                className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Cooldown (minutes)
              </label>
              <input
                type="number"
                value={settings.phone_verification_cooldown_minutes}
                onChange={(e) => setSettings({ ...settings, phone_verification_cooldown_minutes: parseInt(e.target.value) })}
                min={1}
                max={60}
                className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>
          </div>
        </div>
      </div>

      {/* OTP Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" /> OTP Configuration
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-foreground">OTP Length</label>
            <select
              value={settings.otp_length}
              onChange={(e) => setSettings({ ...settings, otp_length: parseInt(e.target.value) })}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            >
              <option value={4}>4 digits</option>
              <option value={6}>6 digits</option>
              <option value={8}>8 digits</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">OTP Type</label>
            <select
              value={settings.otp_type}
              onChange={(e) => setSettings({ ...settings, otp_type: e.target.value as 'numeric' | 'alphanumeric' })}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            >
              <option value="numeric">Numeric only (123456)</option>
              <option value="alphanumeric">Alphanumeric (A1B2C3)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Max Verifications/Day</label>
            <input
              type="number"
              value={settings.max_verifications_per_day}
              onChange={(e) => setSettings({ ...settings, max_verifications_per_day: parseInt(e.target.value) })}
              min={1}
              max={20}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            />
          </div>
        </div>

        <div className="mt-4 p-4 rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong>Preview:</strong> Users will receive a {settings.otp_length}-character {settings.otp_type} code that expires in {settings.phone_verification_expiry_minutes} minutes. 
            They can request up to {settings.max_verifications_per_day} codes per day with a {settings.phone_verification_cooldown_minutes}-minute cooldown between requests.
          </p>
        </div>
      </div>
    </div>
  );
}
