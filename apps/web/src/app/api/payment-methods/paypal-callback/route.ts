/**
 * PayPal OAuth Callback
 * 
 * Handles the OAuth callback from PayPal and saves the linked account.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for error from PayPal
    if (error) {
      console.error('PayPal OAuth error:', error);
      return NextResponse.redirect(new URL('/dashboard/billing?error=paypal_denied', request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/dashboard/billing?error=invalid_callback', request.url));
    }

    // Verify state
    const savedState = request.cookies.get('paypal_oauth_state')?.value;
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL('/dashboard/billing?error=state_mismatch', request.url));
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, request);
    if (!tokens) {
      return NextResponse.redirect(new URL('/dashboard/billing?error=token_exchange_failed', request.url));
    }

    // Get user info from PayPal
    const userInfo = await getPayPalUserInfo(tokens.access_token);
    if (!userInfo) {
      return NextResponse.redirect(new URL('/dashboard/billing?error=userinfo_failed', request.url));
    }

    // Save to database
    await supabase.from('payment_methods').insert({
      user_id: user.id,
      method_type: 'paypal',
      display_name: `PayPal (${userInfo.email})`,
      paypal_email: userInfo.email,
      paypal_payer_id: userInfo.payer_id,
      is_default: false,
      status: 'verified',
    });

    // Clear the state cookie
    const response = NextResponse.redirect(new URL('/dashboard/billing?paypal=connected', request.url));
    response.cookies.delete('paypal_oauth_state');
    return response;

  } catch (error) {
    console.error('PayPal callback error:', error);
    return NextResponse.redirect(new URL('/dashboard/billing?error=callback_failed', request.url));
  }
}

async function exchangeCodeForTokens(code: string, request: NextRequest) {
  const baseUrl = PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/payment-methods/paypal-callback`;

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  try {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: returnUrl,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', errorText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token exchange error:', error);
    return null;
  }
}

async function getPayPalUserInfo(accessToken: string) {
  const baseUrl = PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  try {
    const response = await fetch(`${baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UserInfo failed:', errorText);
      return null;
    }

    const data = await response.json();
    
    return {
      user_id: data.user_id,
      email: data.emails?.find((e: { primary: boolean }) => e.primary)?.value || data.email,
      name: data.name,
      payer_id: data.payer_id,
    };
  } catch (error) {
    console.error('UserInfo error:', error);
    return null;
  }
}
