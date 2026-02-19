export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

const SUPPORTED_PAYMENT_GATEWAYS = new Set([
  'stripe',
  'flutterwave',
  'paypal',
  'paystack',
]);

function normalizeGatewayList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value) => SUPPORTED_PAYMENT_GATEWAYS.has(value));
  return Array.from(new Set(normalized));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = (searchParams.get('country') || '').toUpperCase();

    if (!country) {
      return NextResponse.json({ error: 'country query param is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('region_config')
      .select('region_code, is_active, payment_providers, updated_at')
      .eq('region_code', country)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `No region config found for ${country}`, failClosed: true },
        { status: 503 }
      );
    }

    if (!data.is_active) {
      return NextResponse.json(
        { error: `Region ${country} is disabled`, failClosed: true },
        { status: 503 }
      );
    }

    const gateways = normalizeGatewayList(data.payment_providers);
    if (gateways.length === 0) {
      return NextResponse.json(
        { error: `No supported payment gateways configured for ${country}`, failClosed: true },
        { status: 503 }
      );
    }

    const { data: credentialRows } = await supabase
      .from('payment_provider_credentials')
      .select('provider, is_active')
      .eq('region_code', country);

    const activeCredentialProviders = new Set(
      (credentialRows || [])
        .filter((row) => row.is_active !== false)
        .map((row) => String(row.provider || '').toLowerCase())
        .filter((provider) => SUPPORTED_PAYMENT_GATEWAYS.has(provider))
    );

    const filteredGateways =
      activeCredentialProviders.size > 0
        ? gateways.filter((gateway) => activeCredentialProviders.has(gateway))
        : gateways;

    if (filteredGateways.length === 0) {
      return NextResponse.json(
        {
          error: `No active payment provider credentials configured for ${country}`,
          failClosed: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      countryCode: country,
      gateways: filteredGateways,
      configuredGateways: gateways,
      credentialedGateways: activeCredentialProviders.size > 0 ? filteredGateways : [],
      version: String(data.updated_at ? Date.parse(data.updated_at) : Date.now()),
      updatedAt: data.updated_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime payment gateway error:', error);
    return NextResponse.json(
      { error: 'Failed to load payment gateway config', failClosed: true },
      { status: 500 }
    );
  }
}
