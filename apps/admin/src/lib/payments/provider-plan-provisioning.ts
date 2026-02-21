import { supabaseAdmin } from '@/lib/supabase';

type Provider = 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
type BillingCycle = 'monthly' | 'annual';

const PROVIDERS: Provider[] = ['stripe', 'paypal', 'flutterwave', 'paystack'];
const PRODUCT_SCOPE = 'creator_subscription';
const REGION_CODE = 'GLOBAL';

type ExistingMappingRow = {
  provider: Provider;
  billing_cycle: BillingCycle | 'yearly';
  currency: string;
  provider_plan_id: string;
  provider_product_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type PriceTarget = {
  billingCycle: BillingCycle;
  currency: string;
  amountCents: number;
};

export type ProviderProvisioningSummary = {
  attempted: boolean;
  skippedReason?: string;
  warnings: string[];
  providers: Array<{
    provider: Provider;
    configured: boolean;
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  }>;
};

type CreatorPlanProvisionInput = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  planType?: string | null;
  prices?: Record<string, unknown> | null;
  trialEnabled?: boolean;
  trialDurationDays?: number;
  trialAutoBillEnabled?: boolean;
};

type ProviderCredentialRow = {
  region_code: string;
  provider: string;
  is_active: boolean;
  credentials: Record<string, unknown> | null;
};

type ProviderCredentials = {
  stripeSecretKey: string | null;
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  paypalMode: 'sandbox' | 'live';
  flutterwaveSecretKey: string | null;
  paystackSecretKey: string | null;
};

function normalizePlanType(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isCreatorPlan(planType: unknown): boolean {
  const normalized = normalizePlanType(planType);
  return normalized === '' || normalized === 'creator' || normalized === 'photographer';
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asCredentialObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return fallback;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeCurrency(value: unknown): string | null {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return code;
}

function normalizeCredentialKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

type FlattenedCredential = {
  normalizedPathParts: string[];
  value: string;
};

function flattenCredentialStrings(
  value: unknown,
  normalizedPathParts: string[] = [],
  depth = 0,
  acc: FlattenedCredential[] = []
): FlattenedCredential[] {
  if (depth > 4 || value === null || value === undefined) {
    return acc;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      acc.push({
        normalizedPathParts,
        value: trimmed,
      });
    }
    return acc;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    acc.push({
      normalizedPathParts,
      value: String(value),
    });
    return acc;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenCredentialStrings(item, normalizedPathParts, depth + 1, acc);
    }
    return acc;
  }

  if (typeof value === 'object') {
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeCredentialKey(rawKey);
      flattenCredentialStrings(rawValue, [...normalizedPathParts, normalized], depth + 1, acc);
    }
  }

  return acc;
}

function findCredentialValue(credentials: unknown, keys: string[]): string | null {
  const keySet = new Set(
    keys.map((key) => normalizeCredentialKey(key)).filter((key) => key.length > 0)
  );
  if (!keySet.size) return null;

  const flattened = flattenCredentialStrings(asCredentialObject(credentials));
  for (const entry of flattened) {
    const parts = entry.normalizedPathParts;
    const lastIndex = parts.length - 1;
    const lastPart = lastIndex >= 0 ? parts[lastIndex] : '';
    if (lastPart && keySet.has(lastPart)) {
      return entry.value;
    }
  }

  for (const entry of flattened) {
    for (const part of entry.normalizedPathParts) {
      if (part && keySet.has(part)) {
        return entry.value;
      }
    }
  }

  return null;
}

function formatMajorAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

function isMissingTableError(error: any, tableName: string) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    message.includes(`relation "${tableName}" does not exist`) ||
    message.includes(`could not find the table`) ||
    message.includes(tableName.toLowerCase())
  );
}

function isAutoManagedMapping(metadata: Record<string, unknown> | null | undefined): boolean {
  return asBoolean(metadata?.auto_managed, false);
}

function resolveTrialMetadata(input: CreatorPlanProvisionInput): Record<string, unknown> {
  const trialEnabled = Boolean(input.trialEnabled);
  const trialDurationDays = Math.max(1, Math.min(30, Math.round(Number(input.trialDurationDays || 14))));
  const trialAutoBillEnabled = input.trialAutoBillEnabled !== false;

  return {
    trial_supported: trialEnabled,
    trial_duration_days: trialDurationDays,
    trial_duration_flexible: true,
    trial_auto_bill_off_supported: true,
    trial_auto_bill_enabled: trialAutoBillEnabled,
  };
}

function buildPriceTargets(prices: Record<string, unknown> | null | undefined): PriceTarget[] {
  const normalizedPrices = asObject(prices);
  const monthlyByCurrency = new Map<string, number>();

  for (const [key, value] of Object.entries(normalizedPrices)) {
    const currency = normalizeCurrency(key);
    const amount = asNumber(value);
    if (!currency || amount === null) continue;
    const rounded = Math.round(amount);
    if (rounded <= 0) continue;
    monthlyByCurrency.set(currency, rounded);
  }

  const targets: PriceTarget[] = [];
  for (const [currency, monthlyAmountCents] of monthlyByCurrency.entries()) {
    targets.push({
      billingCycle: 'monthly',
      currency,
      amountCents: monthlyAmountCents,
    });
    targets.push({
      billingCycle: 'annual',
      currency,
      amountCents: Math.round(monthlyAmountCents * 10),
    });
  }

  return targets;
}

function orderPriceTargets(targets: PriceTarget[]): PriceTarget[] {
  const billingWeight = (billingCycle: BillingCycle) => (billingCycle === 'monthly' ? 0 : 1);
  return [...targets].sort((a, b) => {
    const aUsd = a.currency === 'USD' ? 0 : 1;
    const bUsd = b.currency === 'USD' ? 0 : 1;
    if (aUsd !== bUsd) return aUsd - bUsd;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return billingWeight(a.billingCycle) - billingWeight(b.billingCycle);
  });
}

function findBestCredentialValue(
  rows: ProviderCredentialRow[],
  provider: Provider,
  keys: string[]
): string | null {
  const providerRows = rows.filter((row) => String(row.provider || '').toLowerCase() === provider);
  const preferredRows = [
    ...providerRows.filter((row) => String(row.region_code || '').toUpperCase() === REGION_CODE),
    ...providerRows.filter((row) => String(row.region_code || '').toUpperCase() !== REGION_CODE),
  ];

  for (const row of preferredRows) {
    const candidate = findCredentialValue(row.credentials, keys);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

async function loadProviderCredentialsFromDb(): Promise<ProviderCredentialRow[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from('payment_provider_credentials')
    .select('region_code, provider, is_active, credentials')
    .eq('is_active', true)
    .in('provider', PROVIDERS);

  if (error) {
    if (isMissingTableError(error, 'payment_provider_credentials')) {
      return [];
    }
    throw error;
  }

  return (data || []) as ProviderCredentialRow[];
}

async function resolveCredentials(): Promise<ProviderCredentials> {
  const rows = await loadProviderCredentialsFromDb();

  const stripeSecretKey =
    process.env.STRIPE_SECRET_KEY ||
    findBestCredentialValue(rows, 'stripe', [
      'secret_key',
      'secretKey',
      'sk',
      'private_key',
      'live_secret_key',
      'test_secret_key',
    ]) ||
    null;

  const paypalClientId =
    process.env.PAYPAL_CLIENT_ID ||
    findBestCredentialValue(rows, 'paypal', [
      'client_id',
      'clientId',
      'paypal_client_id',
      'live_client_id',
      'test_client_id',
    ]) ||
    null;
  const paypalClientSecret =
    process.env.PAYPAL_CLIENT_SECRET ||
    findBestCredentialValue(rows, 'paypal', [
      'client_secret',
      'clientSecret',
      'paypal_client_secret',
      'live_client_secret',
      'test_client_secret',
      'secret_key',
    ]) ||
    null;
  const paypalModeRaw =
    process.env.PAYPAL_MODE ||
    findBestCredentialValue(rows, 'paypal', ['mode']) ||
    'sandbox';
  const paypalMode = String(paypalModeRaw).toLowerCase() === 'live' ? 'live' : 'sandbox';

  const flutterwaveSecretKey =
    process.env.FLUTTERWAVE_SECRET_KEY ||
    findBestCredentialValue(rows, 'flutterwave', [
      'secret_key',
      'secretKey',
      'sk',
      'live_secret_key',
      'test_secret_key',
      'private_key',
      'api_key',
    ]) ||
    null;

  const paystackSecretKey =
    process.env.PAYSTACK_SECRET_KEY ||
    findBestCredentialValue(rows, 'paystack', [
      'secret_key',
      'secretKey',
      'sk',
      'live_secret_key',
      'test_secret_key',
      'private_key',
      'api_key',
      'secret',
    ]) ||
    null;

  return {
    stripeSecretKey,
    paypalClientId,
    paypalClientSecret,
    paypalMode,
    flutterwaveSecretKey,
    paystackSecretKey,
  };
}

async function parseJsonResponse(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function createStripeProduct(params: {
  secretKey: string;
  planCode: string;
  planName: string;
  description?: string | null;
}): Promise<string> {
  const body = new URLSearchParams();
  body.append('name', params.planName);
  body.append('description', params.description || `Creator subscription plan (${params.planCode})`);
  body.append('metadata[plan_code]', params.planCode);
  body.append('metadata[product_scope]', PRODUCT_SCOPE);
  body.append('type', 'service');

  const response = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2023-10-16',
    },
    body: body.toString(),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || 'Stripe product creation failed');
  }
  return String(data.id);
}

async function createStripeRecurringPrice(params: {
  secretKey: string;
  productId: string;
  amountCents: number;
  currency: string;
  billingCycle: BillingCycle;
  planCode: string;
}): Promise<string> {
  const body = new URLSearchParams();
  body.append('product', params.productId);
  body.append('unit_amount', String(Math.round(params.amountCents)));
  body.append('currency', params.currency.toLowerCase());
  body.append('recurring[interval]', params.billingCycle === 'annual' ? 'year' : 'month');
  body.append('recurring[interval_count]', '1');
  body.append('metadata[plan_code]', params.planCode);
  body.append('metadata[billing_cycle]', params.billingCycle);
  body.append('metadata[currency]', params.currency);
  body.append('metadata[product_scope]', PRODUCT_SCOPE);

  const response = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2023-10-16',
    },
    body: body.toString(),
  });

  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.message || 'Stripe price creation failed');
  }
  return String(data.id);
}

async function getPayPalAccessToken(params: {
  clientId: string;
  clientSecret: string;
  mode: 'sandbox' | 'live';
}): Promise<string> {
  const baseUrl =
    params.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'PayPal access token request failed');
  }
  return String(data.access_token);
}

async function createPayPalProduct(params: {
  accessToken: string;
  mode: 'sandbox' | 'live';
  planCode: string;
  planName: string;
  description?: string | null;
}): Promise<string> {
  const baseUrl =
    params.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const response = await fetch(`${baseUrl}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      name: params.planName,
      description: params.description || `Creator subscription plan (${params.planCode})`,
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.id) {
    throw new Error(data?.message || 'PayPal product creation failed');
  }
  return String(data.id);
}

async function createPayPalBillingPlan(params: {
  accessToken: string;
  mode: 'sandbox' | 'live';
  productId: string;
  planName: string;
  description?: string | null;
  billingCycle: BillingCycle;
  currency: string;
  amountCents: number;
}): Promise<string> {
  const baseUrl =
    params.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      product_id: params.productId,
      name: `${params.planName} ${params.currency} ${params.billingCycle}`,
      description: params.description || 'Auto-generated billing plan',
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: params.billingCycle === 'annual' ? 'YEAR' : 'MONTH',
            interval_count: 1,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: formatMajorAmount(params.amountCents),
              currency_code: params.currency,
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: {
          value: '0',
          currency_code: params.currency,
        },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 1,
      },
      taxes: {
        percentage: '0',
        inclusive: false,
      },
    }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || !data?.id) {
    throw new Error(data?.message || 'PayPal billing plan creation failed');
  }
  return String(data.id);
}

async function createFlutterwavePaymentPlan(params: {
  secretKey: string;
  planName: string;
  billingCycle: BillingCycle;
  currency: string;
  amountCents: number;
}): Promise<string> {
  const response = await fetch('https://api.flutterwave.com/v3/payment-plans', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${params.planName} ${params.currency} ${params.billingCycle}`,
      amount: formatMajorAmount(params.amountCents),
      currency: params.currency,
      interval: params.billingCycle === 'annual' ? 'yearly' : 'monthly',
    }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || data?.status === 'error' || !data?.data?.id) {
    throw new Error(data?.message || 'Flutterwave payment plan creation failed');
  }
  return String(data.data.id);
}

async function createPaystackPlan(params: {
  secretKey: string;
  planName: string;
  description?: string | null;
  billingCycle: BillingCycle;
  currency: string;
  amountCents: number;
}): Promise<string> {
  const response = await fetch('https://api.paystack.co/plan', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${params.planName} ${params.currency} ${params.billingCycle}`,
      amount: Math.round(params.amountCents),
      interval: params.billingCycle === 'annual' ? 'annually' : 'monthly',
      currency: params.currency,
      description: params.description || 'Auto-generated recurring plan',
      send_invoices: true,
      send_sms: false,
    }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok || data?.status === false || !data?.data?.plan_code) {
    throw new Error(data?.message || 'Paystack plan creation failed');
  }
  return String(data.data.plan_code);
}

async function loadExistingMappings(planCode: string): Promise<ExistingMappingRow[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from('provider_plan_mappings')
    .select(
      'provider, billing_cycle, currency, provider_plan_id, provider_product_id, is_active, metadata'
    )
    .eq('product_scope', PRODUCT_SCOPE)
    .eq('internal_plan_code', planCode)
    .eq('region_code', REGION_CODE)
    .in('provider', PROVIDERS);

  if (error) {
    if (isMissingTableError(error, 'provider_plan_mappings')) {
      return [];
    }
    throw error;
  }

  return (data || []) as ExistingMappingRow[];
}

async function upsertProviderPlanMapping(params: {
  planCode: string;
  provider: Provider;
  billingCycle: BillingCycle;
  currency: string;
  providerPlanId: string;
  providerProductId: string | null;
  metadata: Record<string, unknown>;
}) {
  const payload = {
    product_scope: PRODUCT_SCOPE,
    internal_plan_code: params.planCode,
    provider: params.provider,
    provider_plan_id: params.providerPlanId,
    provider_product_id: params.providerProductId,
    billing_cycle: params.billingCycle,
    currency: params.currency,
    region_code: REGION_CODE,
    is_active: true,
    metadata: params.metadata,
  };

  const { error } = await (supabaseAdmin as any)
    .from('provider_plan_mappings')
    .upsert(payload, {
      onConflict: 'product_scope,internal_plan_code,provider,billing_cycle,currency,region_code',
    });

  if (error) {
    throw error;
  }
}

function resolveExistingMapping(
  rows: ExistingMappingRow[],
  provider: Provider,
  billingCycle: BillingCycle,
  currency: string
) {
  return rows.find(
    (row) =>
      row.provider === provider &&
      (row.billing_cycle === billingCycle || (billingCycle === 'annual' && row.billing_cycle === 'yearly')) &&
      String(row.currency || '').toUpperCase() === currency
  );
}

function buildAutoMetadata(
  input: CreatorPlanProvisionInput,
  target: PriceTarget,
  provider: Provider,
  existingMetadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return {
    ...asObject(existingMetadata),
    ...resolveTrialMetadata(input),
    auto_managed: true,
    auto_managed_provider: provider,
    auto_managed_at: new Date().toISOString(),
    auto_managed_source: 'admin_pricing_plan_sync',
    amount_cents: target.amountCents,
    currency: target.currency,
    billing_cycle: target.billingCycle,
  };
}

function hasSameAmount(existing: ExistingMappingRow | undefined, targetAmountCents: number): boolean {
  if (!existing) return false;
  const metadata = asObject(existing.metadata);
  const amountFromMetadata = asNumber(metadata.amount_cents);
  if (amountFromMetadata === null) return false;
  return Math.round(amountFromMetadata) === Math.round(targetAmountCents);
}

export async function provisionCreatorPlanProviderMappings(
  input: CreatorPlanProvisionInput
): Promise<ProviderProvisioningSummary> {
  const baseSummary: ProviderProvisioningSummary = {
    attempted: false,
    warnings: [],
    providers: PROVIDERS.map((provider) => ({
      provider,
      configured: false,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    })),
  };

  if (!isCreatorPlan(input.planType)) {
    return {
      ...baseSummary,
      skippedReason: 'Plan type is not creator/photographer',
    };
  }

  const normalizedCode = String(input.code || '').trim().toLowerCase();
  if (!normalizedCode || normalizedCode === 'free') {
    return {
      ...baseSummary,
      skippedReason: 'Free or invalid plan code does not require recurring provider mappings',
    };
  }

  const targets = orderPriceTargets(buildPriceTargets(input.prices));
  if (!targets.length) {
    return {
      ...baseSummary,
      skippedReason: 'No paid prices available for plan provisioning',
    };
  }

  baseSummary.attempted = true;

  const credentials = await resolveCredentials();
  const existingMappings = await loadExistingMappings(normalizedCode);

  let stripeProductIdCache: string | null =
    existingMappings.find((row) => row.provider === 'stripe' && row.provider_product_id)?.provider_product_id ||
    null;
  let paypalProductIdCache: string | null =
    existingMappings.find((row) => row.provider === 'paypal' && row.provider_product_id)?.provider_product_id ||
    null;
  let paypalAccessTokenCache: string | null = null;

  for (const providerSummary of baseSummary.providers) {
    const provider = providerSummary.provider;
    const providerConfigured =
      (provider === 'stripe' && Boolean(credentials.stripeSecretKey)) ||
      (provider === 'paypal' &&
        Boolean(credentials.paypalClientId) &&
        Boolean(credentials.paypalClientSecret)) ||
      (provider === 'flutterwave' && Boolean(credentials.flutterwaveSecretKey)) ||
      (provider === 'paystack' && Boolean(credentials.paystackSecretKey));

    providerSummary.configured = providerConfigured;
    if (!providerConfigured) {
      providerSummary.skipped += targets.length;
      baseSummary.warnings.push(`${provider}: credentials missing, skipped provider plan provisioning`);
      continue;
    }

    for (const target of targets) {
      try {
        const existing = resolveExistingMapping(
          existingMappings,
          provider,
          target.billingCycle,
          target.currency
        );

        if (existing && !isAutoManagedMapping(existing.metadata)) {
          providerSummary.skipped += 1;
          baseSummary.warnings.push(
            `${provider}/${target.billingCycle}/${target.currency}: existing manual mapping retained`
          );
          continue;
        }

        const mergedMetadata = buildAutoMetadata(input, target, provider, existing?.metadata);
        if (existing && existing.provider_plan_id && hasSameAmount(existing, target.amountCents)) {
          await upsertProviderPlanMapping({
            planCode: normalizedCode,
            provider,
            billingCycle: target.billingCycle,
            currency: target.currency,
            providerPlanId: existing.provider_plan_id,
            providerProductId: existing.provider_product_id || null,
            metadata: mergedMetadata,
          });
          providerSummary.updated += 1;
          continue;
        }

        let providerProductId: string | null = existing?.provider_product_id || null;
        let providerPlanId: string;

        if (provider === 'stripe') {
          if (!stripeProductIdCache) {
            stripeProductIdCache = await createStripeProduct({
              secretKey: credentials.stripeSecretKey as string,
              planCode: normalizedCode,
              planName: input.name,
              description: input.description,
            });
          }
          providerProductId = stripeProductIdCache;
          providerPlanId = await createStripeRecurringPrice({
            secretKey: credentials.stripeSecretKey as string,
            productId: stripeProductIdCache,
            amountCents: target.amountCents,
            currency: target.currency,
            billingCycle: target.billingCycle,
            planCode: normalizedCode,
          });
        } else if (provider === 'paypal') {
          if (!paypalAccessTokenCache) {
            paypalAccessTokenCache = await getPayPalAccessToken({
              clientId: credentials.paypalClientId as string,
              clientSecret: credentials.paypalClientSecret as string,
              mode: credentials.paypalMode,
            });
          }
          if (!paypalProductIdCache) {
            paypalProductIdCache = await createPayPalProduct({
              accessToken: paypalAccessTokenCache,
              mode: credentials.paypalMode,
              planCode: normalizedCode,
              planName: input.name,
              description: input.description,
            });
          }
          providerProductId = paypalProductIdCache;
          providerPlanId = await createPayPalBillingPlan({
            accessToken: paypalAccessTokenCache,
            mode: credentials.paypalMode,
            productId: paypalProductIdCache,
            planName: input.name,
            description: input.description,
            billingCycle: target.billingCycle,
            currency: target.currency,
            amountCents: target.amountCents,
          });
        } else if (provider === 'flutterwave') {
          providerPlanId = await createFlutterwavePaymentPlan({
            secretKey: credentials.flutterwaveSecretKey as string,
            planName: input.name,
            billingCycle: target.billingCycle,
            currency: target.currency,
            amountCents: target.amountCents,
          });
        } else {
          providerPlanId = await createPaystackPlan({
            secretKey: credentials.paystackSecretKey as string,
            planName: input.name,
            description: input.description,
            billingCycle: target.billingCycle,
            currency: target.currency,
            amountCents: target.amountCents,
          });
        }

        await upsertProviderPlanMapping({
          planCode: normalizedCode,
          provider,
          billingCycle: target.billingCycle,
          currency: target.currency,
          providerPlanId,
          providerProductId,
          metadata: mergedMetadata,
        });

        if (existing?.provider_plan_id) {
          providerSummary.updated += 1;
        } else {
          providerSummary.created += 1;
        }
      } catch (error: any) {
        const message = String(error?.message || error || 'Unknown provisioning error');
        providerSummary.errors.push(
          `${target.currency}/${target.billingCycle}: ${message}`
        );
        providerSummary.skipped += 1;
        baseSummary.warnings.push(
          `${provider}/${target.billingCycle}/${target.currency}: ${message}`
        );
      }
    }
  }

  return baseSummary;
}
