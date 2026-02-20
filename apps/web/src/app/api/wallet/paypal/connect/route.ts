export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

function getPayPalAuthBase(): string {
  return PAYPAL_MODE === 'live'
    ? 'https://www.paypal.com'
    : 'https://www.sandbox.paypal.com';
}

function encodeState(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!PAYPAL_CLIENT_ID) {
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=payments&error=paypal_not_configured', request.url)
      );
    }

    const regionCountry = String(
      request.nextUrl.searchParams.get('country') || 'US'
    ).toUpperCase();

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const callbackUrl = `${appUrl}/api/wallet/paypal/callback`;
    const statePayload = {
      purpose: 'wallet_link',
      userId: user.id,
      country: regionCountry,
      nonce: randomUUID(),
      ts: Date.now(),
    };
    const state = encodeState(statePayload);

    const params = new URLSearchParams({
      flowEntry: 'static',
      client_id: PAYPAL_CLIENT_ID,
      scope: 'openid email https://uri.paypal.com/services/paypalattributes',
      redirect_uri: callbackUrl,
      state,
      response_type: 'code',
    });

    const response = NextResponse.redirect(
      `${getPayPalAuthBase()}/signin/authorize?${params.toString()}`
    );
    response.cookies.set('paypal_wallet_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('PayPal wallet connect error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?tab=payments&error=paypal_connect_failed', request.url)
    );
  }
}
