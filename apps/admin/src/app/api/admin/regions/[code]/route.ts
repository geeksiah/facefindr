import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

const SUPPORTED_PAYMENT_PROVIDERS = [
  'stripe',
  'flutterwave',
  'paystack',
  'mtn_momo',
  'vodafone_cash',
  'airteltigo_money',
  'mpesa',
  'paypal',
] as const;

type PaymentProvider = (typeof SUPPORTED_PAYMENT_PROVIDERS)[number];

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeInt(value: unknown, fallback: number, min?: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  let safe = Math.trunc(parsed);
  if (typeof min === 'number') safe = Math.max(min, safe);
  if (typeof max === 'number') safe = Math.min(max, safe);
  return safe;
}

function normalizeDecimal(value: unknown, fallback: number, min?: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  let safe = parsed;
  if (typeof min === 'number') safe = Math.max(min, safe);
  if (typeof max === 'number') safe = Math.min(max, safe);
  return safe;
}

function normalizeCurrency(value: unknown, fallback: string) {
  const raw = String(value || fallback || 'USD').trim().toUpperCase();
  return raw.length === 3 ? raw : fallback;
}

function normalizeProviderList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const provider = String(item || '').trim().toLowerCase();
    if (!SUPPORTED_PAYMENT_PROVIDERS.includes(provider as PaymentProvider)) continue;
    if (seen.has(provider)) continue;
    seen.add(provider);
    out.push(provider);
  }
  return out;
}

function normalizeCurrencyList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const code = String(item || '').trim().toUpperCase();
    if (code.length !== 3) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.length > 0 ? out : fallback;
}

function sanitizeRegionUpdate(payload: Record<string, any>) {
  const update: Record<string, any> = {};

  if (typeof payload.region_name === 'string') update.region_name = payload.region_name.trim();
  if (typeof payload.is_active === 'boolean') update.is_active = payload.is_active;
  if (typeof payload.launch_date === 'string' || payload.launch_date === null) update.launch_date = payload.launch_date;

  if (payload.default_currency !== undefined) {
    update.default_currency = normalizeCurrency(payload.default_currency, 'USD');
  }
  if (payload.supported_currencies !== undefined) {
    update.supported_currencies = normalizeCurrencyList(payload.supported_currencies, ['USD']);
  }

  if (payload.sms_provider !== undefined) {
    update.sms_provider = payload.sms_provider ? String(payload.sms_provider).toLowerCase() : null;
  }
  if (payload.sms_provider_config !== undefined) update.sms_provider_config = asObject(payload.sms_provider_config);
  if (typeof payload.sms_enabled === 'boolean') update.sms_enabled = payload.sms_enabled;

  if (payload.email_provider !== undefined) {
    update.email_provider = payload.email_provider ? String(payload.email_provider).toLowerCase() : null;
  }
  if (payload.email_provider_config !== undefined) update.email_provider_config = asObject(payload.email_provider_config);
  if (typeof payload.email_enabled === 'boolean') update.email_enabled = payload.email_enabled;

  if (typeof payload.whatsapp_enabled === 'boolean') update.whatsapp_enabled = payload.whatsapp_enabled;
  if (payload.whatsapp_provider !== undefined) {
    update.whatsapp_provider = payload.whatsapp_provider ? String(payload.whatsapp_provider).toLowerCase() : null;
  }

  if (typeof payload.push_enabled === 'boolean') update.push_enabled = payload.push_enabled;
  if (payload.push_provider !== undefined) {
    update.push_provider = payload.push_provider ? String(payload.push_provider).toLowerCase() : null;
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

  if (payload.payment_providers !== undefined) {
    update.payment_providers = normalizeProviderList(payload.payment_providers, ['stripe']);
  }
  if (payload.payout_providers !== undefined) {
    update.payout_providers = normalizeProviderList(payload.payout_providers, ['stripe']);
  }

  if (payload.payout_minimum !== undefined) {
    update.payout_minimum = normalizeInt(payload.payout_minimum, 5000, 0);
  }
  if (typeof payload.instant_payout_enabled === 'boolean') {
    update.instant_payout_enabled = payload.instant_payout_enabled;
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

  if (payload.notes !== undefined) update.notes = payload.notes ? String(payload.notes) : null;

  if (payload.platform_commission_percent !== undefined) {
    update.platform_commission_percent = normalizeDecimal(payload.platform_commission_percent, 15, 0, 100);
  }
  if (payload.transaction_fee_percent !== undefined) {
    update.transaction_fee_percent = normalizeDecimal(payload.transaction_fee_percent, 0, 0, 100);
  }
  if (payload.transaction_fee_fixed !== undefined) {
    update.transaction_fee_fixed = normalizeInt(payload.transaction_fee_fixed, 0, 0);
  }
  if (payload.payout_minimum_threshold !== undefined) {
    update.payout_minimum_threshold = normalizeInt(payload.payout_minimum_threshold, 5000, 0);
  }
  if (payload.payout_fee_percent !== undefined) {
    update.payout_fee_percent = normalizeDecimal(payload.payout_fee_percent, 0, 0, 100);
  }
  if (payload.payout_fee_fixed !== undefined) {
    update.payout_fee_fixed = normalizeInt(payload.payout_fee_fixed, 0, 0);
  }

  return update;
}

function sanitizeCredentialPayload(value: unknown) {
  const obj = asObject(value);
  const credentials = asObject(obj.credentials);
  const supportedMethods = Array.isArray(obj.supported_methods)
    ? Array.from(new Set(obj.supported_methods.map((item) => String(item || '').trim()).filter(Boolean)))
    : ['card'];

  const minAmount = normalizeInt(obj.min_amount, 100, 0);
  const maxAmount = normalizeInt(obj.max_amount, 100000000, minAmount);

  return {
    is_active: normalizeBoolean(obj.is_active, true),
    is_test_mode: normalizeBoolean(obj.is_test_mode, true),
    credentials,
    supported_methods: supportedMethods,
    min_amount: minAmount,
    max_amount: maxAmount,
  };
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

    const { data, error } = await supabaseAdmin
      .from('region_config')
      .select('*')
      .eq('region_code', params.code.toUpperCase())
      .single();

    if (error) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const { data: providerCredentials } = await supabaseAdmin
      .from('payment_provider_credentials')
      .select(
        'provider, is_active, is_test_mode, credentials, supported_methods, min_amount, max_amount, updated_at'
      )
      .eq('region_code', params.code.toUpperCase())
      .order('provider', { ascending: true });

    return NextResponse.json({
      region: data,
      paymentProviderCredentials: providerCredentials || [],
    });
  } catch (error) {
    console.error('Get region error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
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

    const body = await request.json();
    const regionCode = params.code.toUpperCase();

    const payloadRegion = asObject(body?.region ?? body);
    const payloadCredentials = asObject(body?.paymentProviderCredentials);

    const { data: currentRegion, error: currentRegionError } = await supabaseAdmin
      .from('region_config')
      .select('region_code, payment_providers, payout_providers')
      .eq('region_code', regionCode)
      .single();

    if (currentRegionError || !currentRegion) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const regionUpdate = sanitizeRegionUpdate(payloadRegion);
    const effectivePaymentProviders = normalizeProviderList(
      regionUpdate.payment_providers ?? currentRegion.payment_providers ?? [],
      ['stripe']
    );
    const effectivePayoutProviders = normalizeProviderList(
      regionUpdate.payout_providers ?? currentRegion.payout_providers ?? [],
      []
    ).filter((provider) => effectivePaymentProviders.includes(provider));

    regionUpdate.payment_providers = effectivePaymentProviders;
    regionUpdate.payout_providers =
      effectivePayoutProviders.length > 0
        ? effectivePayoutProviders
        : effectivePaymentProviders.length > 0
        ? [effectivePaymentProviders[0]]
        : ['stripe'];
    regionUpdate.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('region_config')
      .update({
        ...regionUpdate,
      })
      .eq('region_code', regionCode);

    if (error) throw error;

    // Upsert provider credentials for selected providers.
    for (const provider of effectivePaymentProviders) {
      const providerPayload = payloadCredentials[provider];
      if (!providerPayload) continue;

      const sanitized = sanitizeCredentialPayload(providerPayload);
      const { error: upsertError } = await supabaseAdmin
        .from('payment_provider_credentials')
        .upsert(
          {
            region_code: regionCode,
            provider,
            ...sanitized,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'region_code,provider',
          }
        );

      if (upsertError) {
        throw upsertError;
      }
    }

    // Keep rows for removed providers but mark them inactive.
    const { data: existingCredProviders } = await supabaseAdmin
      .from('payment_provider_credentials')
      .select('provider')
      .eq('region_code', regionCode);

    const toDeactivate = (existingCredProviders || [])
      .map((row) => row.provider)
      .filter((provider) => !effectivePaymentProviders.includes(provider));

    if (toDeactivate.length > 0) {
      const { error: deactivateError } = await supabaseAdmin
        .from('payment_provider_credentials')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('region_code', regionCode)
        .in('provider', toDeactivate);

      if (deactivateError) {
        throw deactivateError;
      }
    }

    await logAction('settings_update', 'region_config', undefined, {
      region_code: params.code,
      changes: Object.keys(regionUpdate),
      credentialProvidersUpdated: Object.keys(payloadCredentials),
    });
    await bumpRuntimeConfigVersion('regions', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update region error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
