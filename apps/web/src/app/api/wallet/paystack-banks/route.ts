export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { listPaystackBanks, resolvePaystackSecretKey } from '@/lib/payments/paystack';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const country = String(
      request.nextUrl.searchParams.get('country') || 'GH'
    ).toUpperCase();

    const paystackSecretKey = await resolvePaystackSecretKey(country);
    if (!paystackSecretKey) {
      return NextResponse.json(
        { error: 'Paystack is not configured for this region' },
        { status: 503 }
      );
    }

    const banks = await listPaystackBanks(country, paystackSecretKey);
    return NextResponse.json({ country, banks });
  } catch (error) {
    console.error('Paystack bank list error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load Paystack banks',
      },
      { status: 500 }
    );
  }
}
