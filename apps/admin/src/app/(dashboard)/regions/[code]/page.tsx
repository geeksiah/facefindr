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
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

function getCurrencySymbol(currencyCode: string): string {
  const code = (currencyCode || 'USD').toUpperCase();
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === 'currency')?.value;
    if (symbol) {
      return symbol;
    }
  } catch {
    // Fall back to currency code below.
  }
  return `${code} `;
}

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
  whatsapp_enabled: boolean;
  whatsapp_provider: string | null;
  email_provider: string;
  email_provider_config: Record<string, any>;
  email_enabled: boolean;
  push_enabled: boolean;
  push_provider: string | null;
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

type PaymentProvider =
  | 'stripe'
  | 'flutterwave'
  | 'paystack'
  | 'mtn_momo'
  | 'vodafone_cash'
  | 'airteltigo_money'
  | 'mpesa'
  | 'paypal';

interface ProviderCredentialField {
  key: string;
  label: string;
  sensitive?: boolean;
}

interface PaymentProviderOption {
  value: PaymentProvider;
  label: string;
  methods: string[];
  credentialFields: ProviderCredentialField[];
}

interface PaymentProviderCredentialForm {
  is_active: boolean;
  is_test_mode: boolean;
  credentials: Record<string, string>;
  supported_methods: string[];
  min_amount: number;
  max_amount: number;
}

const WHATSAPP_PROVIDER_OPTIONS = [
  { value: 'twilio', label: 'Twilio WhatsApp' },
  { value: 'meta_cloud_api', label: 'Meta WhatsApp Cloud API' },
  { value: 'messagebird', label: 'MessageBird WhatsApp' },
  { value: 'africas_talking', label: "Africa's Talking WhatsApp" },
];

const PUSH_PROVIDER_OPTIONS = [
  { value: 'expo', label: 'Expo Push' },
  { value: 'fcm', label: 'Firebase Cloud Messaging (FCM)' },
  { value: 'apns', label: 'Apple Push Notification Service (APNs)' },
  { value: 'onesignal', label: 'OneSignal' },
];

const PAYMENT_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  {
    value: 'stripe',
    label: 'Stripe',
    methods: ['card', 'apple_pay', 'google_pay'],
    credentialFields: [
      { key: 'publishable_key', label: 'Publishable key' },
      { key: 'secret_key', label: 'Secret key', sensitive: true },
      { key: 'webhook_secret', label: 'Webhook secret', sensitive: true },
    ],
  },
  {
    value: 'flutterwave',
    label: 'Flutterwave',
    methods: ['card', 'bank_transfer', 'mobile_money'],
    credentialFields: [
      { key: 'public_key', label: 'Public key' },
      { key: 'secret_key', label: 'Secret key', sensitive: true },
      { key: 'encryption_key', label: 'Encryption key', sensitive: true },
    ],
  },
  {
    value: 'paystack',
    label: 'Paystack',
    methods: ['card', 'bank_transfer', 'ussd'],
    credentialFields: [
      { key: 'public_key', label: 'Public key' },
      { key: 'secret_key', label: 'Secret key', sensitive: true },
      { key: 'webhook_secret', label: 'Webhook secret', sensitive: true },
    ],
  },
  {
    value: 'paypal',
    label: 'PayPal',
    methods: ['paypal_wallet', 'card'],
    credentialFields: [
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client secret', sensitive: true },
      { key: 'webhook_id', label: 'Webhook ID' },
    ],
  },
  {
    value: 'mtn_momo',
    label: 'MTN MoMo',
    methods: ['mobile_money'],
    credentialFields: [
      { key: 'api_user', label: 'API user' },
      { key: 'api_key', label: 'API key', sensitive: true },
      { key: 'subscription_key', label: 'Subscription key', sensitive: true },
      { key: 'environment', label: 'Environment' },
    ],
  },
  {
    value: 'vodafone_cash',
    label: 'Vodafone Cash',
    methods: ['mobile_money'],
    credentialFields: [
      { key: 'merchant_id', label: 'Merchant ID' },
      { key: 'api_key', label: 'API key', sensitive: true },
      { key: 'environment', label: 'Environment' },
    ],
  },
  {
    value: 'airteltigo_money',
    label: 'AirtelTigo Money',
    methods: ['mobile_money'],
    credentialFields: [
      { key: 'client_id', label: 'Client ID' },
      { key: 'client_secret', label: 'Client secret', sensitive: true },
      { key: 'environment', label: 'Environment' },
    ],
  },
  {
    value: 'mpesa',
    label: 'M-Pesa',
    methods: ['mobile_money'],
    credentialFields: [
      { key: 'consumer_key', label: 'Consumer key' },
      { key: 'consumer_secret', label: 'Consumer secret', sensitive: true },
      { key: 'shortcode', label: 'Shortcode' },
      { key: 'passkey', label: 'Passkey', sensitive: true },
      { key: 'environment', label: 'Environment' },
    ],
  },
];

function getProviderConfig(provider: PaymentProvider) {
  return PAYMENT_PROVIDER_OPTIONS.find((entry) => entry.value === provider);
}

function getDefaultCredentialState(provider: PaymentProvider): PaymentProviderCredentialForm {
  const option = getProviderConfig(provider);
  return {
    is_active: true,
    is_test_mode: true,
    credentials: {},
    supported_methods: option?.methods || ['card'],
    min_amount: 100,
    max_amount: 100000000,
  };
}

function toProviderMap(
  rows: Array<{
    provider: PaymentProvider;
    is_active?: boolean;
    is_test_mode?: boolean;
    credentials?: Record<string, string>;
    supported_methods?: string[];
    min_amount?: number;
    max_amount?: number;
  }>,
  selectedProviders: PaymentProvider[]
) {
  const map: Record<string, PaymentProviderCredentialForm> = {};

  for (const provider of selectedProviders) {
    map[provider] = getDefaultCredentialState(provider);
  }

  for (const row of rows || []) {
    const provider = row.provider;
    map[provider] = {
      ...getDefaultCredentialState(provider),
      is_active: row.is_active ?? true,
      is_test_mode: row.is_test_mode ?? true,
      credentials: row.credentials || {},
      supported_methods:
        Array.isArray(row.supported_methods) && row.supported_methods.length > 0
          ? row.supported_methods
          : getDefaultCredentialState(provider).supported_methods,
      min_amount: Number.isFinite(row.min_amount) ? Number(row.min_amount) : 100,
      max_amount: Number.isFinite(row.max_amount) ? Number(row.max_amount) : 100000000,
    };
  }

  return map;
}

export default function RegionConfigPage() {
  const params = useParams();
  const code = params?.code as string;

  const [config, setConfig] = useState<RegionConfig | null>(null);
  const [smsPresets, setSmsPresets] = useState<SmsPreset[]>([]);
  const [providerCredentials, setProviderCredentials] = useState<Record<string, PaymentProviderCredentialForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateProviderCredential(
    provider: PaymentProvider,
    patch: Partial<PaymentProviderCredentialForm>
  ) {
    setProviderCredentials((prev) => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || getDefaultCredentialState(provider)),
        ...patch,
      },
    }));
  }

  useEffect(() => {
    const fetchData = async () => {
      const [configRes, presetsRes] = await Promise.all([
        fetch(`/api/admin/regions/${code}`),
        fetch('/api/admin/regions/sms-presets'),
      ]);

      if (configRes.ok) {
        const data = await configRes.json();
        const regionConfig = data.region as RegionConfig;
        const selectedProviders = (regionConfig.payment_providers || []).filter((provider: string) =>
          PAYMENT_PROVIDER_OPTIONS.some((entry) => entry.value === provider)
        ) as PaymentProvider[];

        setConfig(regionConfig);
        setProviderCredentials(
          toProviderMap((data.paymentProviderCredentials || []) as any[], selectedProviders)
        );
      }

      if (presetsRes.ok) {
        const data = await presetsRes.json();
        setSmsPresets(data.presets || []);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [code]);

  useEffect(() => {
    if (!config) return;
    const selectedProviders = (config.payment_providers || []).filter((provider: string) =>
      PAYMENT_PROVIDER_OPTIONS.some((entry) => entry.value === provider)
    ) as PaymentProvider[];

    setProviderCredentials((prev) => {
      const next = { ...prev };
      for (const provider of selectedProviders) {
        if (!next[provider]) {
          next[provider] = getDefaultCredentialState(provider);
        }
      }
      return next;
    });
  }, [config?.payment_providers]);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/admin/regions/${code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: config,
          paymentProviderCredentials: providerCredentials,
        }),
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const payload = await response.json().catch(() => ({}));
        setSaveError(payload?.error || 'Failed to save region configuration');
      }
    } catch (error) {
      console.error('Save failed:', error);
      setSaveError('Failed to save region configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-8 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
        </div>
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="h-48 animate-pulse rounded-xl border border-border bg-card" />
        ))}
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
  const selectedPaymentProviders = (config.payment_providers || []).filter((provider: string) =>
    PAYMENT_PROVIDER_OPTIONS.some((entry) => entry.value === provider)
  ) as PaymentProvider[];

  function handlePaymentProviderToggle(provider: PaymentProvider, checked: boolean) {
    setConfig((prev) => {
      if (!prev) return prev;
      const previousProviders = (prev.payment_providers || []).filter((value) =>
        PAYMENT_PROVIDER_OPTIONS.some((entry) => entry.value === value)
      ) as PaymentProvider[];
      const nextProviders = checked
        ? Array.from(new Set([...previousProviders, provider]))
        : previousProviders.filter((value) => value !== provider);

      const nextPayoutProviders = checked
        ? Array.from(new Set([...(prev.payout_providers || []), provider]))
        : (prev.payout_providers || []).filter((value) => value !== provider);

      return {
        ...prev,
        payment_providers: nextProviders,
        payout_providers: nextPayoutProviders,
      };
    });

    if (checked && !providerCredentials[provider]) {
      setProviderCredentials((prev) => ({
        ...prev,
        [provider]: getDefaultCredentialState(provider),
      }));
    }
  }

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

      {saveError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {saveError}
        </div>
      )}

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

      {/* WhatsApp Configuration */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> WhatsApp Provider
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.whatsapp_enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  whatsapp_enabled: e.target.checked,
                  whatsapp_provider: e.target.checked ? config.whatsapp_provider : null,
                })
              }
              className="rounded"
            />
            <span className="text-foreground">Enabled</span>
          </label>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Provider</label>
          <select
            value={config.whatsapp_provider || ''}
            onChange={(e) =>
              setConfig({
                ...config,
                whatsapp_provider: e.target.value || null,
              })
            }
            className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            disabled={!config.whatsapp_enabled}
          >
            <option value="">Select Provider</option>
            {WHATSAPP_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Push Configuration */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Phone className="h-5 w-5" /> Push Provider
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.push_enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  push_enabled: e.target.checked,
                  push_provider: e.target.checked ? config.push_provider : null,
                })
              }
              className="rounded"
            />
            <span className="text-foreground">Enabled</span>
          </label>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Provider</label>
          <select
            value={config.push_provider || ''}
            onChange={(e) =>
              setConfig({
                ...config,
                push_provider: e.target.value || null,
              })
            }
            className="w-full mt-1 px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
            disabled={!config.push_enabled}
          >
            <option value="">Select Provider</option>
            {PUSH_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
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
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Payment Providers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure region payment gateways with credentials, mode, methods, and limits.
            </p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            {selectedPaymentProviders.length} enabled
          </div>
        </div>

        <div className="space-y-4">
          {PAYMENT_PROVIDER_OPTIONS.map((providerOption) => {
            const provider = providerOption.value;
            const selected = selectedPaymentProviders.includes(provider);
            const credentialState =
              providerCredentials[provider] || getDefaultCredentialState(provider);
            const payoutEnabled = (config.payout_providers || []).includes(provider);

            return (
              <div key={provider} className="rounded-lg border border-border bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => handlePaymentProviderToggle(provider, e.target.checked)}
                      className="rounded"
                    />
                    <div>
                      <p className="font-medium text-foreground">{providerOption.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Methods: {providerOption.methods.join(', ')}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={payoutEnabled}
                      disabled={!selected}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(new Set([...(config.payout_providers || []), provider]))
                          : (config.payout_providers || []).filter((value) => value !== provider);
                        setConfig({ ...config, payout_providers: next });
                      }}
                      className="rounded"
                    />
                    Enable for payouts
                  </label>
                </div>

                {selected && (
                  <div className="space-y-4 border-t border-border px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={credentialState.is_active}
                          onChange={(e) =>
                            updateProviderCredential(provider, { is_active: e.target.checked })
                          }
                          className="rounded"
                        />
                        <span className="text-foreground">Provider active</span>
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={credentialState.is_test_mode}
                          onChange={(e) =>
                            updateProviderCredential(provider, { is_test_mode: e.target.checked })
                          }
                          className="rounded"
                        />
                        <span className="text-foreground">Test mode</span>
                      </label>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Min amount</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={credentialState.min_amount}
                          onChange={(e) =>
                            updateProviderCredential(provider, {
                              min_amount: Number.parseInt(e.target.value || '0', 10) || 0,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Max amount</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={credentialState.max_amount}
                          onChange={(e) =>
                            updateProviderCredential(provider, {
                              max_amount: Number.parseInt(e.target.value || '0', 10) || 0,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
                        />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Supported methods</p>
                      <div className="flex flex-wrap gap-3">
                        {providerOption.methods.map((method) => {
                          const checked = credentialState.supported_methods.includes(method);
                          return (
                            <label key={method} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const nextMethods = e.target.checked
                                    ? Array.from(new Set([...credentialState.supported_methods, method]))
                                    : credentialState.supported_methods.filter((value) => value !== method);
                                  updateProviderCredential(provider, {
                                    supported_methods: nextMethods.length > 0 ? nextMethods : [method],
                                  });
                                }}
                                className="rounded"
                              />
                              <span className="text-foreground">{method}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {providerOption.credentialFields.map((field) => (
                        <div key={`${provider}-${field.key}`}>
                          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                          <input
                            type={field.sensitive ? 'password' : 'text'}
                            value={credentialState.credentials[field.key] || ''}
                            onChange={(e) =>
                              updateProviderCredential(provider, {
                                credentials: {
                                  ...credentialState.credentials,
                                  [field.key]: e.target.value,
                                },
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-foreground"
                            placeholder={field.label}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Provider credentials are stored per region and used by runtime payment gateway selection.
        </p>
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
