export const dynamic = 'force-dynamic';

/**
 * PayPal Connect API
 * 
 * Initiates PayPal OAuth flow to link a user's PayPal account.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';

function resolveReturnPath(request: NextRequest): string {
  const candidate = request.nextUrl.searchParams.get('returnTo') || '/dashboard/billing';
  if (!candidate.startsWith('/')) return '/dashboard/billing';
  if (candidate.startsWith('//')) return '/dashboard/billing';
  return candidate;
}

export async function GET(request: NextRequest) {
  try {
    const returnPath = resolveReturnPath(request);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!PAYPAL_CLIENT_ID) {
      console.error('PayPal not configured');
      return NextResponse.redirect(new URL(`${returnPath}?error=paypal_not_configured`, request.url));
    }

    // Generate state for CSRF protection
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    })).toString('base64url');

    // Store state in cookie for verification
    const response = NextResponse.redirect(getPayPalAuthUrl(state, request));
    response.cookies.set('paypal_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });
    response.cookies.set('payment_return_to', returnPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
    });

    return response;

  } catch (error) {
    console.error('PayPal connect error:', error);
    const returnPath = resolveReturnPath(request);
    return NextResponse.redirect(new URL(`${returnPath}?error=paypal_error`, request.url));
  }
}

function getPayPalAuthUrl(state: string, request: NextRequest): string {
  const baseUrl = PAYPAL_MODE === 'live' 
    ? 'https://www.paypal.com'
    : 'https://www.sandbox.paypal.com';

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/payment-methods/paypal-callback`;

  const params = new URLSearchParams({
    flowEntry: 'static',
    client_id: PAYPAL_CLIENT_ID!,
    scope: 'openid email https://uri.paypal.com/services/paypalattributes',
    redirect_uri: returnUrl,
    state,
    response_type: 'code',
  });

  return `${baseUrl}/signin/authorize?${params.toString()}`;
}

