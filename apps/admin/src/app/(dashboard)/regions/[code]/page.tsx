'use client';

import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const PAYMENT_PROVIDERS = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'flutterwave', label: 'Flutterwave' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'paystack', label: 'Paystack' },
] as const;

type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]['value'];

interface RegionConfig {
  region_code: string;
  region_name: string;
  is_active: boolean;
  default_currency: string;
  payment_providers: PaymentProvider[];
}

interface ProviderCredentialForm {
  is_active: boolean;
  is_test_mode: boolean;
  credentialsText: string;
}

function toProviderCredentialMap(rows: any[]): Record<string, ProviderCredentialForm> {
  const next: Record<string, ProviderCredentialForm> = {};
  for (const provider of PAYMENT_PROVIDERS) {
    next[provider.value] = {
      is_active: true,
      is_test_mode: true,
      credentialsText: '{}',
    };
  }
  for (const row of rows || []) {
    const provider = String(row?.provider || '').toLowerCase();
    if (!PAYMENT_PROVIDERS.some((item) => item.value === provider)) continue;
    next[provider] = {
      is_active: row?.is_active !== false,
      is_test_mode: row?.is_test_mode !== false,
      credentialsText: JSON.stringify(row?.credentials || {}, null, 2),
    };
  }
  return next;
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase().slice(0, 3) || 'USD';
}

export default function RegionConfigPage() {
  const params = useParams();
  const code = String(params?.code || '').toUpperCase();

  const [config, setConfig] = useState<RegionConfig | null>(null);
  const [providerCredentials, setProviderCredentials] =
    useState<Record<string, ProviderCredentialForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setSaveError(null);
      try {
        const response = await fetch(`/api/admin/regions/${encodeURIComponent(code)}`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load region config');
        }
        const region = data.region as RegionConfig;
        const allowedProviders = (region?.payment_providers || []).filter((provider) =>
          PAYMENT_PROVIDERS.some((item) => item.value === provider)
        ) as PaymentProvider[];
        setConfig({
          ...region,
          payment_providers: allowedProviders,
          default_currency: normalizeCurrency(region?.default_currency || 'USD'),
        });
        setProviderCredentials(toProviderCredentialMap(data.paymentProviderCredentials || []));
      } catch (error: any) {
        setSaveError(error?.message || 'Failed to load region config');
      } finally {
        setIsLoading(false);
      }
    };

    if (code) {
      void load();
    }
  }, [code]);

  const selectedProviders = useMemo(
    () => (config?.payment_providers || []) as PaymentProvider[],
    [config?.payment_providers]
  );

  function toggleProvider(provider: PaymentProvider, enabled: boolean) {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = enabled
        ? Array.from(new Set([...prev.payment_providers, provider]))
        : prev.payment_providers.filter((item) => item !== provider);
      return { ...prev, payment_providers: next as PaymentProvider[] };
    });
  }

  function updateProviderCredential(provider: PaymentProvider, patch: Partial<ProviderCredentialForm>) {
    setProviderCredentials((prev) => ({
      ...prev,
      [provider]: {
        ...(prev[provider] || {}),
        ...patch,
        is_active:
          (patch.is_active ?? prev[provider]?.is_active ?? true),
        is_test_mode:
          (patch.is_test_mode ?? prev[provider]?.is_test_mode ?? true),
        credentialsText:
          (patch.credentialsText ?? prev[provider]?.credentialsText ?? '{}'),
      },
    }));
  }

  async function handleSave() {
    if (!config) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const credentialsPayload: Record<string, any> = {};
      for (const provider of selectedProviders) {
        const form = providerCredentials[provider] || {
          is_active: true,
          is_test_mode: true,
          credentialsText: '{}',
        };
        let parsedCredentials: Record<string, any> = {};
        try {
          parsedCredentials = JSON.parse(form.credentialsText || '{}');
        } catch {
          throw new Error(`Invalid credentials JSON for ${provider}`);
        }
        credentialsPayload[provider] = {
          is_active: form.is_active,
          is_test_mode: form.is_test_mode,
          credentials: parsedCredentials,
        };
      }

      const payload = {
        region: {
          region_name: config.region_name,
          is_active: config.is_active,
          default_currency: normalizeCurrency(config.default_currency),
          payment_providers: selectedProviders.length > 0 ? selectedProviders : ['stripe'],
        },
        paymentProviderCredentials: credentialsPayload,
      };

      const response = await fetch(`/api/admin/regions/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save region config');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      setSaveError(error?.message || 'Failed to save region config');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-red-500">
        {saveError || 'Region not found'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/regions"
            className="rounded-lg border border-border p-2 text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {config.region_name} ({config.region_code})
            </h1>
            <p className="text-sm text-muted-foreground">Simple region payment configuration</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      {saved && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" />
            Configuration saved
          </span>
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {saveError}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Region Basics</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Region Name</span>
            <input
              value={config.region_name || ''}
              onChange={(event) =>
                setConfig((prev) => (prev ? { ...prev, region_name: event.target.value } : prev))
              }
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Default Currency</span>
            <input
              value={config.default_currency || 'USD'}
              onChange={(event) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, default_currency: normalizeCurrency(event.target.value) }
                    : prev
                )
              }
              maxLength={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground uppercase"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">Region Active</span>
            <input
              type="checkbox"
              checked={config.is_active}
              onChange={(event) =>
                setConfig((prev) => (prev ? { ...prev, is_active: event.target.checked } : prev))
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Enabled Payment Providers</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PAYMENT_PROVIDERS.map((provider) => {
            const enabled = selectedProviders.includes(provider.value);
            return (
              <label
                key={provider.value}
                className="flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2"
              >
                <span className="text-sm text-foreground">{provider.label}</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => toggleProvider(provider.value, event.target.checked)}
                />
              </label>
            );
          })}
        </div>
      </div>

      {selectedProviders.map((provider) => {
        const credentialForm = providerCredentials[provider] || {
          is_active: true,
          is_test_mode: true,
          credentialsText: '{}',
        };

        return (
          <div key={provider} className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">
                {PAYMENT_PROVIDERS.find((item) => item.value === provider)?.label} Credentials
              </h3>
              <div className="flex items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Active</span>
                  <input
                    type="checkbox"
                    checked={credentialForm.is_active}
                    onChange={(event) =>
                      updateProviderCredential(provider, { is_active: event.target.checked })
                    }
                  />
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Test Mode</span>
                  <input
                    type="checkbox"
                    checked={credentialForm.is_test_mode}
                    onChange={(event) =>
                      updateProviderCredential(provider, { is_test_mode: event.target.checked })
                    }
                  />
                </label>
              </div>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Credentials JSON</span>
              <textarea
                value={credentialForm.credentialsText}
                onChange={(event) =>
                  updateProviderCredential(provider, { credentialsText: event.target.value })
                }
                rows={8}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
                placeholder='{"secret_key":"..."}'
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
