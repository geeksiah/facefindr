export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

function getPayPalApiBaseUrl(): string {
  return PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function decodeState(state: string): Record<string, unknown> | null {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

async function exchangeCodeForTokens(code: string, callbackUrl: string) {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are missing');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${getPayPalApiBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }).toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || 'Failed to exchange PayPal code');
  }
  return payload;
}

async function getPayPalUserInfo(accessToken: string) {
  const response = await fetch(
    `${getPayPalApiBaseUrl()}/v1/identity/oauth2/userinfo?schema=paypalv1.1`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to load PayPal profile');
  }

  const primaryEmail = Array.isArray(payload?.emails)
    ? payload.emails.find((entry: any) => entry?.primary)?.value
    : undefined;

  return {
    email: (primaryEmail || payload?.email || '').toString().trim().toLowerCase(),
    payerId: (payload?.payer_id || payload?.user_id || '').toString().trim(),
  };
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const callbackUrl = `${appUrl}/api/wallet/paypal/callback`;

  const redirectError = (code: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings?tab=payments&error=${encodeURIComponent(code)}`, request.url));

  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');
    if (oauthError) {
      return redirectError('paypal_denied');
    }
    if (!code || !state) {
      return redirectError('paypal_invalid_callback');
    }

    const savedState = request.cookies.get('paypal_wallet_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      return redirectError('paypal_state_mismatch');
    }

    const parsedState = decodeState(state);
    if (!parsedState) {
      return redirectError('paypal_state_invalid');
    }

    const stateUserId = String(parsedState.userId || '');
    const stateTimestamp = Number(parsedState.ts || 0);
    const stateCountry = String(parsedState.country || 'US').toUpperCase();
    if (stateUserId !== user.id) {
      return redirectError('paypal_state_user_mismatch');
    }
    if (!Number.isFinite(stateTimestamp) || Date.now() - stateTimestamp > 10 * 60 * 1000) {
      return redirectError('paypal_state_expired');
    }

    const tokens = await exchangeCodeForTokens(code, callbackUrl);
    const profile = await getPayPalUserInfo(tokens.access_token);
    if (!profile.email) {
      return redirectError('paypal_email_missing');
    }

    const { data: photographer } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!photographer) {
      return redirectError('creator_profile_not_found');
    }

    const photographerId = photographer.id as string;
    const photographerCandidates = await getPhotographerIdCandidates(
      serviceClient,
      user.id,
      user.email
    );

    const { data: regionConfig } = await serviceClient
      .from('region_config')
      .select('default_currency')
      .eq('region_code', stateCountry)
      .maybeSingle();

    const walletPayload: Record<string, unknown> = {
      photographer_id: photographerId,
      provider: 'paypal',
      country_code: stateCountry,
      preferred_currency: regionConfig?.default_currency || 'USD',
      paypal_merchant_id: profile.email,
      status: 'active',
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      default_payout_method: profile.payerId || 'paypal',
      updated_at: new Date().toISOString(),
    };

    const { data: existingWallet } = await serviceClient
      .from('wallets')
      .select('id')
      .in('photographer_id', photographerCandidates)
      .eq('provider', 'paypal')
      .maybeSingle();

    if (existingWallet?.id) {
      const { error: updateError } = await serviceClient
        .from('wallets')
        .update(walletPayload)
        .eq('id', existingWallet.id);
      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await serviceClient
        .from('wallets')
        .insert(walletPayload);
      if (insertError) {
        throw insertError;
      }
    }

    const response = NextResponse.redirect(
      new URL('/dashboard/settings?tab=payments&paypal=connected', request.url)
    );
    response.cookies.delete('paypal_wallet_oauth_state');
    return response;
  } catch (error) {
    console.error('PayPal wallet callback error:', error);
    return redirectError('paypal_wallet_callback_failed');
  }
}
