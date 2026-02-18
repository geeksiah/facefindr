/**
 * Paystack Payment Integration
 *
 * Supports:
 * - Checkout initialization via hosted authorization URL
 * - Transaction verification
 * - Webhook signature verification
 */

import { createHmac, timingSafeEqual } from 'crypto';

import { createServiceClient } from '@/lib/supabase/server';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeParams {
  reference: string;
  email: string;
  amount: number; // smallest currency unit (kobo/cents)
  currency: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  subaccount?: string;
  plan?: string;
}

export interface PaystackInitializeResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  gateway_response?: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
}

function getSecretKey(explicitSecretKey?: string): string {
  const key = explicitSecretKey || process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('Paystack is not configured');
  }
  return key;
}

function extractSecretKey(credentials: unknown): string | null {
  if (!credentials || typeof credentials !== 'object') return null;
  const payload = credentials as Record<string, unknown>;
  const candidate = payload.secret_key || payload.secretKey || payload.sk;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

export async function resolvePaystackSecretKey(regionCode?: string): Promise<string | null> {
  if (!regionCode) {
    return process.env.PAYSTACK_SECRET_KEY || null;
  }

  const supabase = createServiceClient();
  const { data } = await (supabase
    .from('payment_provider_credentials') as any)
    .select('credentials, is_active')
    .eq('region_code', regionCode.toUpperCase())
    .eq('provider', 'paystack')
    .maybeSingle();

  if (data?.is_active) {
    const fromDb = extractSecretKey((data as any).credentials);
    if (fromDb) return fromDb;
  }

  return process.env.PAYSTACK_SECRET_KEY || null;
}

async function paystackRequest<T>(
  endpoint: string,
  secretKey: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();
  if (!response.ok || data?.status === false) {
    throw new Error(data?.message || 'Paystack API request failed');
  }

  return data as T;
}

export function isPaystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export async function initializePaystackPayment(
  params: PaystackInitializeParams,
  explicitSecretKey?: string
): Promise<PaystackInitializeResponse> {
  const secretKey = getSecretKey(explicitSecretKey);
  const payload: Record<string, unknown> = {
    reference: params.reference,
    email: params.email,
    amount: Math.round(params.amount),
    currency: params.currency.toUpperCase(),
    callback_url: params.callbackUrl,
    metadata: params.metadata || {},
  };

  if (params.subaccount) {
    payload.subaccount = params.subaccount;
  }

  if (params.plan) {
    payload.plan = params.plan;
  }

  const response = await paystackRequest<{
    status: boolean;
    message: string;
    data: {
      authorization_url: string;
      access_code: string;
      reference: string;
    };
  }>('/transaction/initialize', secretKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    authorizationUrl: response.data.authorization_url,
    accessCode: response.data.access_code,
    reference: response.data.reference,
  };
}

export async function initializePaystackSubscription(
  params: PaystackInitializeParams,
  explicitSecretKey?: string
): Promise<PaystackInitializeResponse> {
  const payload = {
    ...params,
    plan: params.plan,
  };
  return initializePaystackPayment(payload, explicitSecretKey);
}

export async function getPaystackSubscriptionStatus(
  subscriptionCodeOrId: string,
  explicitSecretKey?: string
): Promise<{ status: string; subscription_code?: string; id?: number }> {
  const secretKey = getSecretKey(explicitSecretKey);

  const response = await paystackRequest<{
    status: boolean;
    message: string;
    data: {
      id?: number;
      subscription_code?: string;
      status: string;
    };
  }>(`/subscription/${encodeURIComponent(subscriptionCodeOrId)}`, secretKey, {
    method: 'GET',
  });

  return {
    status: response.data.status,
    subscription_code: response.data.subscription_code,
    id: response.data.id,
  };
}

export async function verifyPaystackTransaction(
  reference: string,
  explicitSecretKey?: string
): Promise<PaystackVerifyResponse> {
  const secretKey = getSecretKey(explicitSecretKey);
  const response = await paystackRequest<{
    status: boolean;
    message: string;
    data: PaystackVerifyResponse;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, secretKey, {
    method: 'GET',
  });

  return response.data;
}

export function verifyPaystackWebhookSignature(payload: string, signature: string): boolean {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey || !signature) return false;

  const expected = createHmac('sha512', secretKey).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export async function verifyPaystackWebhookSignatureAsync(payload: string, signature: string): Promise<boolean> {
  if (!signature) return false;

  const candidateKeys = new Set<string>();
  if (process.env.PAYSTACK_SECRET_KEY) {
    candidateKeys.add(process.env.PAYSTACK_SECRET_KEY);
  }

  const supabase = createServiceClient();
  const { data } = await (supabase
    .from('payment_provider_credentials') as any)
    .select('credentials, is_active')
    .eq('provider', 'paystack')
    .eq('is_active', true);

  for (const row of data || []) {
    const key = extractSecretKey((row as any).credentials);
    if (key) candidateKeys.add(key);
  }

  for (const secretKey of candidateKeys) {
    const expected = createHmac('sha512', secretKey).update(payload).digest('hex');
    try {
      if (timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
        return true;
      }
    } catch {
      // Continue to next key
    }
  }

  return false;
}
