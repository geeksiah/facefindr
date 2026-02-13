export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const country = (searchParams.get('country') || '').toUpperCase();
    const channelFilter = (searchParams.get('channel') || '').toLowerCase();

    if (!country) {
      return NextResponse.json({ error: 'country query param is required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const [{ data: region, error: regionError }, { data: adminSettings }] = await Promise.all([
      supabase
        .from('region_config')
        .select('region_code, is_active, email_enabled, email_provider, sms_enabled, sms_provider, whatsapp_enabled, whatsapp_provider, push_enabled, push_provider, updated_at')
        .eq('region_code', country)
        .single(),
      supabase
        .from('admin_notification_settings')
        .select('push_enabled, whatsapp_enabled, updated_at')
        .single(),
    ]);

    if (regionError || !region) {
      return NextResponse.json(
        { error: `No region communication config found for ${country}`, failClosed: true },
        { status: 503 }
      );
    }

    if (!region.is_active) {
      return NextResponse.json(
        { error: `Region ${country} is disabled`, failClosed: true },
        { status: 503 }
      );
    }

    const communication = {
      email: {
        enabled: region.email_enabled !== false,
        provider: region.email_provider || null,
      },
      sms: {
        enabled: region.sms_enabled === true,
        provider: region.sms_provider || null,
      },
      whatsapp: {
        enabled: region.whatsapp_enabled === true && adminSettings?.whatsapp_enabled === true,
        provider: region.whatsapp_provider || null,
      },
      push: {
        enabled: region.push_enabled === true && adminSettings?.push_enabled === true,
        provider: region.push_provider || null,
      },
    };

    const validChannels = ['email', 'sms', 'whatsapp', 'push'];
    if (channelFilter && !validChannels.includes(channelFilter)) {
      return NextResponse.json({ error: 'Unsupported channel filter' }, { status: 400 });
    }

    const enabledMissingProvider = Object.entries(communication)
      .filter(([, config]) => config.enabled && !config.provider)
      .map(([channel]) => channel);

    if (enabledMissingProvider.length > 0) {
      return NextResponse.json(
        {
          error: `Enabled channels missing provider for ${country}: ${enabledMissingProvider.join(', ')}`,
          failClosed: true,
        },
        { status: 503 }
      );
    }

    const payload = channelFilter
      ? { [channelFilter]: (communication as Record<string, unknown>)[channelFilter] }
      : communication;
    if (channelFilter) {
      const channelConfig = (communication as Record<string, { enabled: boolean; provider: string | null }>)[channelFilter];
      if (channelConfig?.enabled && !channelConfig.provider) {
        return NextResponse.json(
          {
            error: `Channel ${channelFilter} is enabled but no provider is configured for ${country}`,
            failClosed: true,
          },
          { status: 503 }
        );
      }
    }
    const latestUpdatedAt = [region.updated_at, adminSettings?.updated_at]
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .reduce((max, value) => (value > max ? value : max), 0);

    return NextResponse.json({
      countryCode: country,
      channels: payload,
      version: String(latestUpdatedAt || Date.now()),
      updatedAt: latestUpdatedAt ? new Date(latestUpdatedAt).toISOString() : new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime communication gateway error:', error);
    return NextResponse.json(
      { error: 'Failed to load communication gateway config', failClosed: true },
      { status: 500 }
    );
  }
}
