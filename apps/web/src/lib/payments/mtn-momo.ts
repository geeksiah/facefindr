/**
 * MTN MoMo API integration (Collection + Disbursement products).
 *
 * References:
 * - https://momodeveloper.mtn.com/
 * - https://momodeveloper.mtn.com/api-documentation
 *
 * This module is intentionally minimal:
 * - verify wallet is active for creator setup
 * - create disbursement transfer for payouts
 */

import { createServiceClient } from '@/lib/supabase/server';

type MtnProduct = 'collection' | 'disbursement';
type MtnEnvironment = 'sandbox' | 'production';

export interface MtnMomoConfig {
  baseUrl: string;
  environment: MtnEnvironment;
  targetEnvironment: string;
  apiUser: string;
  apiKey: string;
  collectionSubscriptionKey?: string;
  disbursementSubscriptionKey?: string;
}

export interface MtnTransferResult {
  referenceId: string;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  reason?: string;
  financialTransactionId?: string;
  externalId?: string;
}

const SANDBOX_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
const PROD_BASE_URL = 'https://momodeveloper.mtn.com';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeMsisdn(msisdn: string): string {
  return String(msisdn || '').replace(/[^\d]/g, '').trim();
}

function normalizeAmount(amountMinor: number, currency: string): string {
  const upperCurrency = String(currency || '').toUpperCase();
  const zeroDecimal = new Set(['UGX', 'RWF', 'XOF', 'XAF', 'BIF', 'JPY', 'KRW']);
  if (zeroDecimal.has(upperCurrency)) {
    return String(Math.max(0, Math.round(amountMinor)));
  }
  return (Math.max(0, amountMinor) / 100).toFixed(2);
}

function resolveSubscriptionKey(config: MtnMomoConfig, product: MtnProduct): string | null {
  if (product === 'collection') {
    return config.collectionSubscriptionKey || null;
  }
  return config.disbursementSubscriptionKey || null;
}

function buildBaseUrl(config: MtnMomoConfig): string {
  const base = String(config.baseUrl || '').trim();
  if (base) return base.replace(/\/+$/, '');
  return config.environment === 'production' ? PROD_BASE_URL : SANDBOX_BASE_URL;
}

async function requestAccessToken(config: MtnMomoConfig, product: MtnProduct): Promise<string> {
  const subscriptionKey = resolveSubscriptionKey(config, product);
  if (!subscriptionKey) {
    throw new Error(`Missing MTN ${product} subscription key`);
  }

  const credentials = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64');
  const response = await fetch(`${buildBaseUrl(config)}/${product}/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) {
    throw new Error(body?.message || `MTN ${product} token request failed`);
  }

  return String(body.access_token);
}

async function mtnRequest(
  config: MtnMomoConfig,
  product: MtnProduct,
  path: string,
  options: RequestInit & { referenceId?: string } = {}
) {
  const token = await requestAccessToken(config, product);
  const subscriptionKey = resolveSubscriptionKey(config, product);
  if (!subscriptionKey) {
    throw new Error(`Missing MTN ${product} subscription key`);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'X-Target-Environment': config.targetEnvironment || 'sandbox',
    'Ocp-Apim-Subscription-Key': subscriptionKey,
    ...(options.referenceId ? { 'X-Reference-Id': options.referenceId } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  };

  const response = await fetch(`${buildBaseUrl(config)}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (response.status === 202 || response.status === 204) {
    return { ok: true, status: response.status, data: null as any };
  }

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function resolveMtnMomoConfig(regionCode?: string): Promise<MtnMomoConfig | null> {
  const fallbackApiUser = process.env.MTN_MOMO_API_USER;
  const fallbackApiKey = process.env.MTN_MOMO_API_KEY;
  const fallbackCollectionKey = process.env.MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY;
  const fallbackDisbursementKey = process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY;
  const fallbackBaseUrl = process.env.MTN_MOMO_BASE_URL;
  const fallbackEnv = (process.env.MTN_MOMO_ENVIRONMENT || 'sandbox').toLowerCase();
  const fallbackTarget = process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox';

  const fromEnv =
    fallbackApiUser && fallbackApiKey
      ? {
          baseUrl: fallbackBaseUrl || '',
          environment: (fallbackEnv === 'production' ? 'production' : 'sandbox') as MtnEnvironment,
          targetEnvironment: fallbackTarget,
          apiUser: fallbackApiUser,
          apiKey: fallbackApiKey,
          collectionSubscriptionKey: fallbackCollectionKey || undefined,
          disbursementSubscriptionKey: fallbackDisbursementKey || fallbackCollectionKey || undefined,
        }
      : null;

  if (!regionCode) {
    return fromEnv;
  }

  const supabase = createServiceClient();
  const { data } = await (supabase as any)
    .from('payment_provider_credentials')
    .select('is_active, credentials')
    .eq('region_code', regionCode.toUpperCase())
    .eq('provider', 'mtn_momo')
    .maybeSingle();

  if (!data?.is_active) {
    return fromEnv;
  }

  const credentials = asObject(data.credentials);
  const apiUser = String(
    credentials.api_user || credentials.apiUser || credentials.collection_api_user || ''
  ).trim();
  const apiKey = String(
    credentials.api_key || credentials.apiKey || credentials.collection_api_key || ''
  ).trim();
  const collectionSubscriptionKey = String(
    credentials.collection_subscription_key ||
      credentials.subscription_key ||
      credentials.primary_key ||
      ''
  ).trim();
  const disbursementSubscriptionKey = String(
    credentials.disbursement_subscription_key || credentials.subscription_key || ''
  ).trim();
  const environment = String(credentials.environment || '').toLowerCase();
  const targetEnvironment = String(credentials.target_environment || '').trim();
  const baseUrl = String(credentials.base_url || credentials.baseUrl || '').trim();

  if (!apiUser || !apiKey) {
    return fromEnv;
  }

  return {
    baseUrl: baseUrl || fromEnv?.baseUrl || '',
    environment: (environment === 'production' ? 'production' : fromEnv?.environment || 'sandbox') as MtnEnvironment,
    targetEnvironment: targetEnvironment || fromEnv?.targetEnvironment || 'sandbox',
    apiUser,
    apiKey,
    collectionSubscriptionKey:
      collectionSubscriptionKey || fromEnv?.collectionSubscriptionKey || undefined,
    disbursementSubscriptionKey:
      disbursementSubscriptionKey ||
      collectionSubscriptionKey ||
      fromEnv?.disbursementSubscriptionKey ||
      fromEnv?.collectionSubscriptionKey ||
      undefined,
  };
}

export async function isMtnMomoConfiguredForRegion(regionCode?: string): Promise<boolean> {
  const config = await resolveMtnMomoConfig(regionCode);
  return !!(config?.apiUser && config?.apiKey && config?.disbursementSubscriptionKey);
}

export async function verifyMtnWalletActive(
  msisdn: string,
  regionCode?: string
): Promise<{ valid: boolean; message?: string }> {
  const config = await resolveMtnMomoConfig(regionCode);
  if (!config) {
    return { valid: false, message: 'MTN MoMo is not configured for this region' };
  }

  const normalizedMsisdn = normalizeMsisdn(msisdn);
  if (!normalizedMsisdn) {
    return { valid: false, message: 'Mobile number is required' };
  }

  const response = await mtnRequest(
    config,
    'disbursement',
    `/disbursement/v1_0/accountholder/msisdn/${encodeURIComponent(normalizedMsisdn)}/active`,
    { method: 'GET' }
  );

  if (!response.ok) {
    return {
      valid: false,
      message:
        response.data?.message ||
        response.data?.error ||
        'Failed to verify MTN wallet',
    };
  }

  const result = response.data?.result;
  if (result === true || String(result).toLowerCase() === 'true') {
    return { valid: true };
  }

  return { valid: false, message: 'MTN wallet is not active' };
}

export async function createMtnDisbursementTransfer(params: {
  regionCode?: string;
  referenceId: string;
  externalId: string;
  msisdn: string;
  amountMinor: number;
  currency: string;
  payerMessage: string;
  payeeNote: string;
}): Promise<MtnTransferResult> {
  const config = await resolveMtnMomoConfig(params.regionCode);
  if (!config) {
    throw new Error('MTN MoMo is not configured for this region');
  }

  const normalizedMsisdn = normalizeMsisdn(params.msisdn);
  if (!normalizedMsisdn) {
    throw new Error('Recipient mobile number is required');
  }

  const createResponse = await mtnRequest(
    config,
    'disbursement',
    '/disbursement/v1_0/transfer',
    {
      method: 'POST',
      referenceId: params.referenceId,
      body: JSON.stringify({
        amount: normalizeAmount(params.amountMinor, params.currency),
        currency: String(params.currency || '').toUpperCase(),
        externalId: params.externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: normalizedMsisdn,
        },
        payerMessage: params.payerMessage,
        payeeNote: params.payeeNote,
      }),
    }
  );

  if (!createResponse.ok) {
    throw new Error(
      createResponse.data?.message ||
        createResponse.data?.error ||
        'Failed to create MTN disbursement'
    );
  }

  const statusResponse = await mtnRequest(
    config,
    'disbursement',
    `/disbursement/v1_0/transfer/${encodeURIComponent(params.referenceId)}`,
    { method: 'GET' }
  );

  if (!statusResponse.ok) {
    return {
      referenceId: params.referenceId,
      status: 'PENDING',
      reason: 'Transfer accepted but status lookup failed',
      externalId: params.externalId,
    };
  }

  const status = String(statusResponse.data?.status || 'UNKNOWN').toUpperCase();
  if (status === 'SUCCESSFUL' || status === 'SUCCESS') {
    return {
      referenceId: params.referenceId,
      status: 'SUCCESSFUL',
      externalId: statusResponse.data?.externalId || params.externalId,
      financialTransactionId: statusResponse.data?.financialTransactionId,
    };
  }

  if (status === 'FAILED') {
    return {
      referenceId: params.referenceId,
      status: 'FAILED',
      reason: statusResponse.data?.reason || statusResponse.data?.message,
      externalId: statusResponse.data?.externalId || params.externalId,
    };
  }

  return {
    referenceId: params.referenceId,
    status: 'PENDING',
    reason: statusResponse.data?.reason || statusResponse.data?.message,
    externalId: statusResponse.data?.externalId || params.externalId,
  };
}
