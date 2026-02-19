import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

const SUPPORTED_PAYMENT_PROVIDERS = [
  'stripe',
  'flutterwave',
  'paypal',
  'paystack',
] as const;

type PaymentProvider = (typeof SUPPORTED_PAYMENT_PROVIDERS)[number];

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function normalizeProviderList(value: unknown, fallback: PaymentProvider[] = []): PaymentProvider[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item): item is PaymentProvider =>
      SUPPORTED_PAYMENT_PROVIDERS.includes(item as PaymentProvider)
    );
  return Array.from(new Set(normalized));
}

function normalizeCurrency(value: unknown, fallback = 'USD') {
  const code = String(value || fallback).trim().toUpperCase();
  return code.length === 3 ? code : fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMissingTableError(error: any, tableName: string) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  return error.code === '42P01' || message.includes(`relation "${tableName}" does not exist`);
}

function isMissingColumnError(error: any, columnName: string) {
  if (!error) return false;
  const message = String(error.message || '');
  return error.code === '42703' && message.includes(columnName);
}

function sanitizeRegionUpdate(payload: Record<string, any>) {
  const update: Record<string, any> = {};

  if (typeof payload.region_name === 'string') {
    update.region_name = payload.region_name.trim();
  }
  if (typeof payload.is_active === 'boolean') {
    update.is_active = payload.is_active;
  }
  if (payload.default_currency !== undefined) {
    update.default_currency = normalizeCurrency(payload.default_currency, 'USD');
  }
  if (payload.payment_providers !== undefined) {
    update.payment_providers = normalizeProviderList(payload.payment_providers, ['stripe']);
  }
  if (payload.sms_provider !== undefined) {
    update.sms_provider = payload.sms_provider ? String(payload.sms_provider).toLowerCase() : null;
  }
  if (typeof payload.sms_enabled === 'boolean') {
    update.sms_enabled = payload.sms_enabled;
  }

  if (payload.platform_commission_percent !== undefined) {
    update.platform_commission_percent = normalizeNumber(payload.platform_commission_percent, 0);
  }
  if (payload.transaction_fee_percent !== undefined) {
    update.transaction_fee_percent = normalizeNumber(payload.transaction_fee_percent, 0);
  }
  if (payload.transaction_fee_fixed !== undefined) {
    update.transaction_fee_fixed = Math.round(normalizeNumber(payload.transaction_fee_fixed, 0));
  }
  if (payload.payout_fee_percent !== undefined) {
    update.payout_fee_percent = normalizeNumber(payload.payout_fee_percent, 0);
  }
  if (payload.payout_fee_fixed !== undefined) {
    update.payout_fee_fixed = Math.round(normalizeNumber(payload.payout_fee_fixed, 0));
  }
  if (payload.payout_minimum_threshold !== undefined) {
    update.payout_minimum_threshold = Math.max(
      0,
      Math.round(normalizeNumber(payload.payout_minimum_threshold, 0))
    );
  }

  if (typeof payload.phone_verification_enabled === 'boolean') {
    update.phone_verification_enabled = payload.phone_verification_enabled;
  }
  if (typeof payload.phone_verification_required === 'boolean') {
    update.phone_verification_required = payload.phone_verification_required;
  }
  if (typeof payload.email_verification_enabled === 'boolean') {
    update.email_verification_enabled = payload.email_verification_enabled;
  }
  if (typeof payload.email_verification_required === 'boolean') {
    update.email_verification_required = payload.email_verification_required;
  }

  if (typeof payload.print_orders_enabled === 'boolean') {
    update.print_orders_enabled = payload.print_orders_enabled;
  }
  if (typeof payload.social_features_enabled === 'boolean') {
    update.social_features_enabled = payload.social_features_enabled;
  }
  if (typeof payload.public_events_enabled === 'boolean') {
    update.public_events_enabled = payload.public_events_enabled;
  }
  if (typeof payload.instant_payout_enabled === 'boolean') {
    update.instant_payout_enabled = payload.instant_payout_enabled;
  }

  return update;
}

function sanitizeCredentialPayload(providerPayload: unknown) {
  const payload = asObject(providerPayload);
  const credentials = asObject(payload.credentials);
  return {
    is_active: typeof payload.is_active === 'boolean' ? payload.is_active : true,
    is_test_mode: typeof payload.is_test_mode === 'boolean' ? payload.is_test_mode : true,
    credentials,
  };
}

async function fetchProviderCredentials(regionCode: string) {
  const { data, error } = await (supabaseAdmin as any)
    .from('payment_provider_credentials')
    .select('provider, is_active, is_test_mode, credentials, updated_at')
    .eq('region_code', regionCode)
    .order('provider', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'payment_provider_credentials')) {
      return [];
    }
    if (isMissingColumnError(error, 'is_test_mode')) {
      const fallback = await (supabaseAdmin as any)
        .from('payment_provider_credentials')
        .select('provider, is_active, credentials, updated_at')
        .eq('region_code', regionCode)
        .order('provider', { ascending: true });
      if (fallback.error) {
        if (isMissingTableError(fallback.error, 'payment_provider_credentials')) return [];
        throw fallback.error;
      }
      return (fallback.data || []).map((row: any) => ({
        ...row,
        is_test_mode: true,
      }));
    }
    throw error;
  }

  return data || [];
}

async function upsertProviderCredential(
  regionCode: string,
  provider: PaymentProvider,
  payload: { is_active: boolean; is_test_mode: boolean; credentials: Record<string, any> }
) {
  const basePayload = {
    region_code: regionCode,
    provider,
    is_active: payload.is_active,
    credentials: payload.credentials,
    updated_at: new Date().toISOString(),
  };

  const withTestMode = await (supabaseAdmin as any)
    .from('payment_provider_credentials')
    .upsert(
      {
        ...basePayload,
        is_test_mode: payload.is_test_mode,
      },
      { onConflict: 'region_code,provider' }
    );

  if (!withTestMode.error) return;
  if (isMissingTableError(withTestMode.error, 'payment_provider_credentials')) return;
  if (isMissingColumnError(withTestMode.error, 'is_test_mode')) {
    const fallback = await (supabaseAdmin as any)
      .from('payment_provider_credentials')
      .upsert(basePayload, { onConflict: 'region_code,provider' });
    if (!fallback.error) return;
    if (isMissingTableError(fallback.error, 'payment_provider_credentials')) return;
    throw fallback.error;
  }
  throw withTestMode.error;
}

async function deactivateRemovedProviders(regionCode: string, keepProviders: PaymentProvider[]) {
  const { data: existingRows, error: existingError } = await (supabaseAdmin as any)
    .from('payment_provider_credentials')
    .select('provider')
    .eq('region_code', regionCode);

  if (existingError) {
    if (isMissingTableError(existingError, 'payment_provider_credentials')) return;
    throw existingError;
  }

  const toDeactivate = (existingRows || [])
    .map((row: any) => String(row.provider || '').toLowerCase())
    .filter(
      (provider: string) =>
        provider.length > 0 && !keepProviders.includes(provider as PaymentProvider)
    );

  if (toDeactivate.length === 0) return;

  const { error: withTimestampError } = await (supabaseAdmin as any)
    .from('payment_provider_credentials')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('region_code', regionCode)
    .in('provider', toDeactivate);

  if (!withTimestampError) return;
  if (isMissingColumnError(withTimestampError, 'updated_at')) {
    const fallback = await (supabaseAdmin as any)
      .from('payment_provider_credentials')
      .update({ is_active: false })
      .eq('region_code', regionCode)
      .in('provider', toDeactivate);
    if (!fallback.error) return;
    throw fallback.error;
  }
  throw withTimestampError;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const regionCode = params.code.toUpperCase();
    const { data: region, error: regionError } = await supabaseAdmin
      .from('region_config')
      .select('*')
      .eq('region_code', regionCode)
      .single();

    if (regionError || !region) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const providerCredentials = await fetchProviderCredentials(regionCode);

    return NextResponse.json({
      region,
      paymentProviderCredentials: providerCredentials,
    });
  } catch (error: any) {
    console.error('Get region error:', error);
    return NextResponse.json({ error: error?.message || 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const regionCode = params.code.toUpperCase();
    const body = await request.json();
    const payloadRegion = asObject(body?.region ?? body);
    const payloadCredentials = asObject(body?.paymentProviderCredentials);

    const { data: currentRegion, error: currentRegionError } = await supabaseAdmin
      .from('region_config')
      .select('*')
      .eq('region_code', regionCode)
      .single();

    if (currentRegionError || !currentRegion) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const regionUpdate = sanitizeRegionUpdate(payloadRegion);
    const availableColumns = new Set(Object.keys(currentRegion || {}));
    const currentProviders = normalizeProviderList((currentRegion as any).payment_providers, ['stripe']);
    const effectivePaymentProviders =
      normalizeProviderList(regionUpdate.payment_providers, currentProviders).length > 0
        ? normalizeProviderList(regionUpdate.payment_providers, currentProviders)
        : ['stripe'];

    const filteredRegionUpdate = Object.fromEntries(
      Object.entries(regionUpdate).filter(([key]) => availableColumns.has(key))
    ) as Record<string, any>;

    if (availableColumns.has('payment_providers')) {
      filteredRegionUpdate.payment_providers = effectivePaymentProviders;
    }
    if (availableColumns.has('payout_providers')) {
      filteredRegionUpdate.payout_providers = [...effectivePaymentProviders];
    }
    if (availableColumns.has('default_currency')) {
      filteredRegionUpdate.default_currency = normalizeCurrency(
        filteredRegionUpdate.default_currency ?? (currentRegion as any).default_currency,
        'USD'
      );
    }
    if (availableColumns.has('updated_at')) {
      filteredRegionUpdate.updated_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('region_config')
      .update(filteredRegionUpdate)
      .eq('region_code', regionCode);

    if (updateError) {
      throw updateError;
    }

    for (const provider of effectivePaymentProviders as PaymentProvider[]) {
      const sanitized = sanitizeCredentialPayload(payloadCredentials[provider]);
      await upsertProviderCredential(regionCode, provider, sanitized);
    }

    await deactivateRemovedProviders(regionCode, effectivePaymentProviders as PaymentProvider[]);

    await logAction('settings_update', 'region_config', undefined, {
      region_code: regionCode,
      changes: Object.keys(filteredRegionUpdate),
      payment_providers: effectivePaymentProviders,
    });
    await bumpRuntimeConfigVersion('regions', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update region error:', error);
    return NextResponse.json({ error: error?.message || 'An error occurred' }, { status: 500 });
  }
}
