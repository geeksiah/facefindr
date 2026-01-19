'use client';

import {
  ArrowLeft,
  Save,
  Loader2,
  Globe,
  MessageSquare,
  Mail,
  CreditCard,
  Phone,
  Shield,
  Check,
  DollarSign,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface RegionConfig {
  id: string;
  region_code: string;
  region_name: string;
  is_active: boolean;
  default_currency: string;
  supported_currencies: string[];
  sms_provider: string | null;
  sms_provider_config: Record<string, any>;
  sms_enabled: boolean;
  email_provider: string;
  email_provider_config: Record<string, any>;
  email_enabled: boolean;
  phone_verification_enabled: boolean;
  phone_verification_required: boolean;
  email_verification_enabled: boolean;
  email_verification_required: boolean;
  payment_providers: string[];
  payout_providers: string[];
  payout_minimum: number;
  instant_payout_enabled: boolean;
  print_orders_enabled: boolean;
  social_features_enabled: boolean;
  public_events_enabled: boolean;
  notes: string | null;
  // Platform Fees & Payouts
  platform_commission_percent: number;
  transaction_fee_percent: number;
  transaction_fee_fixed: number;
  payout_minimum_threshold: number;
  payout_fee_percent: number;
  payout_fee_fixed: number;
}

interface SmsPreset {
  provider: string;
  display_name: string;
  supported_regions: string[];
  config_schema: any;
}

export default function RegionConfigPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [config, setConfig] = useState<RegionConfig | null>(null);
  const [smsPresets, setSmsPresets] = useState<SmsPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [configRes, presetsRes] = await Promise.all([
        fetch(`/api/admin/regions/${code}`),
        fetch('/api/admin/regions/sms-presets'),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data.region);
      }

      if (presetsRes.ok) {
        const data = await presetsRes.json();
        setSmsPresets(data.presets || []);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [code]);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/regions/${code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
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

  if (!config) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Region not found</p>
      </div>
    );
  }

  const currentSmsPreset = smsPresets.find(p => p.provider === config.sms_provider);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/regions"
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {config.region_name} ({config.region_code})
            </h1>
            <p className="text-muted-foreground">Configure providers and settings</p>
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

      {/* Status Toggle */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.is_active ? 'bg-green-500/10' : 'bg-gray-500/10'}`}>
              <Globe className={`h-5 w-5 ${config.is_active ? 'text-green-500' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="font-medium text-foreground">Region Status</p>
              <p className="text-sm text-muted-foreground">
                {config.is_active ? 'Region is live and accepting users' : 'Region is disabled'}
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.is_active}
              onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>

      {/* Currency Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Currency Settings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">Default Currency</label>
            <input
              type="text"
              value={config.default_currency}
              onChange={(e) => setConfig({ ...config, default_currency: e.target.value.toUpperCase() })}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              maxLength={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Payout Minimum (smallest unit)</label>
            <input
              type="number"
              value={config.payout_minimum || 0}
              onChange={(e) => setConfig({ ...config, payout_minimum: parseInt(e.target.value) || 0 })}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Platform Fees */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Platform Fees
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set commission and transaction fees for this region. These override the global platform defaults.
        </p>
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <strong>Note:</strong> Region-specific fees take precedence over Platform Settings. Leave empty to use platform defaults.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-foreground">Platform Commission (%)</label>
            <div className="relative mt-1">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={config.platform_commission_percent || 0}
                onChange={(e) => setConfig({ ...config, platform_commission_percent: parseFloat(e.target.value) || 0 })}
                className="w-full pl-8 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Percentage of revenue (whole number, e.g., 20 for 20%)</p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Transaction Fee (%)</label>
            <div className="relative mt-1">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={config.transaction_fee_percent || 0}
                onChange={(e) => setConfig({ ...config, transaction_fee_percent: parseFloat(e.target.value) || 0 })}
                className="w-full pl-8 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Percentage fee per transaction (whole number, e.g., 2 for 2%)</p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Fixed Transaction Fee</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {getCurrencySymbol(config.default_currency || 'USD')}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.transaction_fee_fixed || 0) / 100}
                onChange={(e) => setConfig({ 
                  ...config, 
                  transaction_fee_fixed: Math.round(parseFloat(e.target.value || '0') * 100)
                })}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Fixed fee amount (e.g., 0.30 for {getCurrencySymbol(config.default_currency || 'USD')}0.30)</p>
          </div>
        </div>
      </div>

      {/* Payout Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Payout Settings
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure payout thresholds and fees for photographers
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-foreground">Minimum Payout Threshold</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {getCurrencySymbol(config.default_currency || 'USD')}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.payout_minimum_threshold || 0) / 100}
                onChange={(e) => setConfig({ 
                  ...config, 
                  payout_minimum_threshold: Math.round(parseFloat(e.target.value || '0') * 100)
                })}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Minimum balance to request payout (e.g., 50.00 for {getCurrencySymbol(config.default_currency || 'USD')}50.00)
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Payout Fee (%)</label>
            <div className="relative mt-1">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={config.payout_fee_percent || 0}
                onChange={(e) => setConfig({ ...config, payout_fee_percent: parseFloat(e.target.value) || 0 })}
                className="w-full pl-8 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Percentage fee on payout amount (whole number, e.g., 1 for 1%)</p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Fixed Payout Fee</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {getCurrencySymbol(config.default_currency || 'USD')}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(config.payout_fee_fixed || 0) / 100}
                onChange={(e) => setConfig({ 
                  ...config, 
                  payout_fee_fixed: Math.round(parseFloat(e.target.value || '0') * 100)
                })}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Fixed fee amount (e.g., 2.50 for {getCurrencySymbol(config.default_currency || 'USD')}2.50)
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> Platform commission is calculated first, then transaction fees are applied. 
            Payout fees are deducted when photographers request payouts.
          </p>
        </div>
      </div>

      {/* SMS Configuration */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> SMS Provider
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.sms_enabled}
              onChange={(e) => setConfig({ ...config, sms_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-foreground">Enabled</span>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Provider</label>
            <select
              value={config.sms_provider || ''}
              onChange={(e) => setConfig({ ...config, sms_provider: e.target.value || null, sms_provider_config: {} })}
              className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            >
              <option value="">Select Provider</option>
              {smsPresets
                .filter(p => p.supported_regions.includes(config.region_code))
                .map(preset => (
                  <option key={preset.provider} value={preset.provider}>
                    {preset.display_name}
                  </option>
                ))}
            </select>
          </div>

          {currentSmsPreset && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium text-foreground">Provider Configuration</p>
              {Object.entries(currentSmsPreset.config_schema.properties || {}).map(([key, schema]: [string, any]) => (
                <div key={key}>
                  <label className="text-sm text-muted-foreground">{schema.description || key}</label>
                  <input
                    type={key.includes('key') || key.includes('secret') ? 'password' : 'text'}
                    value={config.sms_provider_config[key] || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      sms_provider_config: { ...config.sms_provider_config, [key]: e.target.value }
                    })}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                    placeholder={schema.description}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Email Configuration */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Provider
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.email_enabled}
              onChange={(e) => setConfig({ ...config, email_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-foreground">Enabled</span>
          </label>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Provider</label>
          <select
            value={config.email_provider}
            onChange={(e) => setConfig({ ...config, email_provider: e.target.value })}
            className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
          >
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
            <option value="ses">Amazon SES</option>
            <option value="postmark">Postmark</option>
            <option value="resend">Resend</option>
            <option value="smtp">Custom SMTP</option>
          </select>
        </div>
      </div>

      {/* Verification Settings */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" /> Verification Settings
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Phone Verification */}
          <div className="space-y-3">
            <p className="font-medium text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4" /> Phone Verification
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.phone_verification_enabled}
                onChange={(e) => setConfig({ ...config, phone_verification_enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-foreground">Enable phone verification</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.phone_verification_required}
                onChange={(e) => setConfig({ ...config, phone_verification_required: e.target.checked })}
                disabled={!config.phone_verification_enabled}
                className="rounded"
              />
              <span className="text-sm text-muted-foreground">Required (not optional)</span>
            </label>
          </div>

          {/* Email Verification */}
          <div className="space-y-3">
            <p className="font-medium text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email Verification
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.email_verification_enabled}
                onChange={(e) => setConfig({ ...config, email_verification_enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-foreground">Enable email verification</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.email_verification_required}
                onChange={(e) => setConfig({ ...config, email_verification_required: e.target.checked })}
                disabled={!config.email_verification_enabled}
                className="rounded"
              />
              <span className="text-sm text-muted-foreground">Required (not optional)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Payment Providers */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Payment Providers
        </h2>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {['stripe', 'flutterwave', 'paystack', 'mtn_momo', 'vodafone_cash', 'airteltigo_money', 'mpesa', 'paypal'].map(provider => (
            <label key={provider} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
              <input
                type="checkbox"
                checked={config.payment_providers.includes(provider)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setConfig({ ...config, payment_providers: [...config.payment_providers, provider] });
                  } else {
                    setConfig({ ...config, payment_providers: config.payment_providers.filter(p => p !== provider) });
                  }
                }}
                className="rounded"
              />
              <span className="text-sm text-foreground capitalize">{provider.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Feature Flags */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Feature Flags</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.print_orders_enabled}
              onChange={(e) => setConfig({ ...config, print_orders_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-foreground">Print Orders</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.social_features_enabled}
              onChange={(e) => setConfig({ ...config, social_features_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-foreground">Social Features</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.public_events_enabled}
              onChange={(e) => setConfig({ ...config, public_events_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-foreground">Public Events</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.instant_payout_enabled}
              onChange={(e) => setConfig({ ...config, instant_payout_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-foreground">Instant Payouts</span>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-foreground mb-4">Notes</h2>
        <textarea
          value={config.notes || ''}
          onChange={(e) => setConfig({ ...config, notes: e.target.value })}
          rows={4}
          className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground resize-none"
          placeholder="Internal notes about this region configuration..."
        />
      </div>
    </div>
  );
}
