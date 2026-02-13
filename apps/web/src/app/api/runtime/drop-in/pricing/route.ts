export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('platform_settings')
      .select('*')
      .in('setting_key', ['drop_in_upload_fee_cents', 'drop_in_gift_fee_cents', 'drop_in_currency']);

    if (error || !data) {
      throw error || new Error('Missing platform settings rows');
    }

    const byKey = new Map<string, string>();
    for (const row of data as any[]) {
      byKey.set(row.setting_key, String(row.setting_value ?? row.value ?? ''));
    }

    const uploadFeeCents = Number(byKey.get('drop_in_upload_fee_cents'));
    const giftFeeCents = Number(byKey.get('drop_in_gift_fee_cents'));
    const currency = String(byKey.get('drop_in_currency') || '').toUpperCase();

    if (!Number.isFinite(uploadFeeCents) || uploadFeeCents <= 0 || !Number.isFinite(giftFeeCents) || !currency) {
      return NextResponse.json(
        { error: 'Drop-in pricing is not configured in admin settings', failClosed: true },
        { status: 503 }
      );
    }

    return NextResponse.json({
      uploadFeeCents: Math.round(uploadFeeCents),
      giftFeeCents: Math.round(giftFeeCents),
      currency,
      uploadFee: Math.round(uploadFeeCents) / 100,
      giftFee: Math.round(giftFeeCents) / 100,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime drop-in pricing error:', error);
    return NextResponse.json(
      { error: 'Failed to load drop-in pricing', failClosed: true },
      { status: 500 }
    );
  }
}

