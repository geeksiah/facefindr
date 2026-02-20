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
const PAYSTACK_SUBACCOUNT_PATTERN = /^ACCT_[A-Z0-9]+$/i;

export class PaystackApiError extends Error {
  statusCode: number;
  payload?: unknown;

  constructor(message: string, statusCode: number, payload?: unknown) {
    super(message);
    this.name = 'PaystackApiError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

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

export interface PaystackSubaccountValidationResult {
  valid: boolean;
  normalizedCode?: string;
  message?: string;
  businessName?: string;
}

export interface PaystackBankAccountValidationResult {
  valid: boolean;
  accountName?: string;
  accountNumber?: string;
  bankId?: number;
  message?: string;
}

export interface PaystackCreateSubaccountParams {
  businessName: string;
  settlementBank: string;
  accountNumber: string;
  percentageCharge?: number;
  description?: string;
  primaryContactEmail?: string;
  primaryContactName?: string;
}

export interface PaystackCreateSubaccountResult {
  subaccountCode: string;
  businessName?: string;
  bankCode?: string;
  accountNumber?: string;
  bankName?: string;
  active?: boolean;
}

export interface PaystackBank {
  id?: number;
  name: string;
  code: string;
  active?: boolean;
  country?: string;
  currency?: string;
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

  const rawBody = await response.text();
  let data: any = null;

  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = null;
    }
  }

  if (!response.ok || data?.status === false) {
    throw new PaystackApiError(
      data?.message || `Paystack API request failed (${response.status})`,
      response.status,
      data
    );
  }

  return data as T;
}

function isInvalidSubaccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (!message) return false;

  return (
    message.includes('subaccount') &&
    (message.includes('invalid') ||
      message.includes('not found') ||
      message.includes('does not exist'))
  );
}

function normalizeAccountNumber(accountNumber: string): string {
  return String(accountNumber || '').replace(/\s+/g, '').trim();
}

function toPaystackCountry(countryCode?: string): string | null {
  const normalized = String(countryCode || '').trim().toUpperCase();
  switch (normalized) {
    case 'GH':
      return 'ghana';
    case 'NG':
      return 'nigeria';
    case 'KE':
      return 'kenya';
    case 'ZA':
      return 'south africa';
    default:
      return null;
  }
}

export function normalizePaystackSubaccountCode(
  code?: string | null
): string | undefined {
  if (typeof code !== 'string') return undefined;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return undefined;
  if (!PAYSTACK_SUBACCOUNT_PATTERN.test(normalized)) return undefined;
  return normalized;
}

export async function verifyPaystackBankAccount(
  accountNumber: string,
  bankCode: string,
  explicitSecretKey?: string
): Promise<PaystackBankAccountValidationResult> {
  const normalizedAccountNumber = normalizeAccountNumber(accountNumber);
  const normalizedBankCode = String(bankCode || '').trim();

  if (!normalizedAccountNumber || !normalizedBankCode) {
    return {
      valid: false,
      message: 'Bank code and account number are required',
    };
  }

  const secretKey = getSecretKey(explicitSecretKey);

  try {
    const response = await paystackRequest<{
      status: boolean;
      message: string;
      data?: {
        account_name?: string;
        account_number?: string;
        bank_id?: number;
      };
    }>(
      `/bank/resolve?account_number=${encodeURIComponent(normalizedAccountNumber)}&bank_code=${encodeURIComponent(
        normalizedBankCode
      )}`,
      secretKey,
      { method: 'GET' }
    );

    return {
      valid: true,
      accountName: response.data?.account_name,
      accountNumber: response.data?.account_number,
      bankId: response.data?.bank_id,
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Failed to verify account',
    };
  }
}

export async function createPaystackSubaccount(
  params: PaystackCreateSubaccountParams,
  explicitSecretKey?: string
): Promise<PaystackCreateSubaccountResult> {
  const secretKey = getSecretKey(explicitSecretKey);
  const normalizedAccountNumber = normalizeAccountNumber(params.accountNumber);
  const normalizedBankCode = String(params.settlementBank || '').trim();

  if (!normalizedAccountNumber || !normalizedBankCode) {
    throw new Error('Bank code and account number are required to create Paystack subaccount');
  }

  const percentageCharge = Number.isFinite(params.percentageCharge)
    ? Math.min(100, Math.max(0, Number(params.percentageCharge)))
    : 0;

  const payload: Record<string, unknown> = {
    business_name: String(params.businessName || '').trim() || 'Creator Wallet',
    bank_code: normalizedBankCode,
    account_number: normalizedAccountNumber,
    percentage_charge: percentageCharge,
  };

  if (params.description) payload.description = params.description;
  if (params.primaryContactEmail) payload.primary_contact_email = params.primaryContactEmail;
  if (params.primaryContactName) payload.primary_contact_name = params.primaryContactName;

  const response = await paystackRequest<{
    status: boolean;
    message: string;
    data?: {
      subaccount_code?: string;
      business_name?: string;
      bank_code?: string;
      settlement_bank?: string;
      account_number?: string;
      bank_name?: string;
      active?: boolean;
    };
  }>('/subaccount', secretKey, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const subaccountCode = response.data?.subaccount_code;
  if (!subaccountCode) {
    throw new Error('Paystack did not return a subaccount code');
  }

  return {
    subaccountCode,
    businessName: response.data?.business_name,
    bankCode: response.data?.bank_code || response.data?.settlement_bank,
    accountNumber: response.data?.account_number,
    bankName: response.data?.bank_name,
    active: response.data?.active,
  };
}

export async function listPaystackBanks(
  countryCode: string,
  explicitSecretKey?: string
): Promise<PaystackBank[]> {
  const paystackCountry = toPaystackCountry(countryCode);
  if (!paystackCountry) {
    return [];
  }

  const secretKey = getSecretKey(explicitSecretKey);
  const response = await paystackRequest<{
    status: boolean;
    message: string;
    data?: Array<{
      id?: number;
      name?: string;
      code?: string;
      active?: boolean;
      country?: string;
      currency?: string;
    }>;
  }>(
    `/bank?country=${encodeURIComponent(
      paystackCountry
    )}&use_cursor=false&perPage=100`,
    secretKey,
    { method: 'GET' }
  );

  return (response.data || [])
    .filter((bank) => Boolean(bank?.name) && Boolean(bank?.code))
    .map((bank) => ({
      id: bank.id,
      name: String(bank.name),
      code: String(bank.code),
      active: bank.active,
      country: bank.country,
      currency: bank.currency,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isPaystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export async function initializePaystackPayment(
  params: PaystackInitializeParams,
  explicitSecretKey?: string
): Promise<PaystackInitializeResponse> {
  const secretKey = getSecretKey(explicitSecretKey);
  const normalizedSubaccount = normalizePaystackSubaccountCode(params.subaccount);
  const payload: Record<string, unknown> = {
    reference: params.reference,
    email: params.email,
    amount: Math.round(params.amount),
    currency: params.currency.toUpperCase(),
    callback_url: params.callbackUrl,
    metadata: params.metadata || {},
  };

  if (normalizedSubaccount) {
    payload.subaccount = normalizedSubaccount;
  }

  if (params.plan) {
    payload.plan = params.plan;
  }

  const initialize = async (requestPayload: Record<string, unknown>) =>
    paystackRequest<{
      status: boolean;
      message: string;
      data: {
        authorization_url: string;
        access_code: string;
        reference: string;
      };
    }>('/transaction/initialize', secretKey, {
      method: 'POST',
      body: JSON.stringify(requestPayload),
    });

  let response;
  try {
    response = await initialize(payload);
  } catch (error) {
    if (normalizedSubaccount && isInvalidSubaccountError(error)) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.subaccount;
      console.warn(
        `[paystack] Invalid subaccount ${normalizedSubaccount}; retrying initialize without subaccount.`
      );
      response = await initialize(fallbackPayload);
    } else {
      throw error;
    }
  }

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

export async function validatePaystackSubaccount(
  subaccountCode: string,
  explicitSecretKey?: string
): Promise<PaystackSubaccountValidationResult> {
  const normalizedCode = normalizePaystackSubaccountCode(subaccountCode);
  if (!normalizedCode) {
    return {
      valid: false,
      message: 'Subaccount code must look like ACCT_xxxxxxxx',
    };
  }

  const secretKey = getSecretKey(explicitSecretKey);

  try {
    const response = await paystackRequest<{
      status: boolean;
      message: string;
      data?: { business_name?: string };
    }>(`/subaccount/${encodeURIComponent(normalizedCode)}`, secretKey, {
      method: 'GET',
    });

    return {
      valid: true,
      normalizedCode,
      businessName: response.data?.business_name,
    };
  } catch (error) {
    if (isInvalidSubaccountError(error)) {
      return {
        valid: false,
        normalizedCode,
        message: error instanceof Error ? error.message : 'Invalid subaccount',
      };
    }
    throw error;
  }
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
