export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import {
  createSubaccount,
  isFlutterwaveConfigured,
} from '@/lib/payments/flutterwave';
import {
  createConnectAccount,
  createAccountLink,
  isStripeConfigured,
} from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      provider,
      country,
      businessName,
      // Flutterwave specific
      accountBank,
      accountNumber,
    } = body;

    // Get photographer profile
    const { data: photographer, error: photographerError } = await supabase
      .from('photographers')
      .select('id, email, display_name, business_name')
      .eq('id', user.id)
      .single();

    if (photographerError || !photographer) {
      return NextResponse.json(
        { error: 'Photographer profile not found' },
        { status: 404 }
      );
    }

    // Check for existing wallet with this provider
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, status')
      .eq('photographer_id', user.id)
      .eq('provider', provider)
      .single();

    if (existingWallet) {
      return NextResponse.json(
        { error: 'Wallet already exists for this provider', wallet: existingWallet },
        { status: 400 }
      );
    }

    const { data: regionConfig } = await supabase
      .from('region_config')
      .select('default_currency')
      .eq('region_code', String(country || '').toUpperCase())
      .maybeSingle();

    const walletData: Record<string, unknown> = {
      photographer_id: user.id,
      provider,
      country_code: country,
      preferred_currency: regionConfig?.default_currency || 'USD',
      status: 'pending',
    };

    let onboardingUrl: string | null = null;

    // Handle Stripe Connect
    if (provider === 'stripe') {
      if (!isStripeConfigured()) {
        return NextResponse.json(
          { error: 'Stripe is not configured' },
          { status: 500 }
        );
      }

      const account = await createConnectAccount({
        email: photographer.email,
        country,
        businessName: businessName || photographer.business_name,
        photographerId: user.id,
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const accountLink = await createAccountLink(
        account.id,
        `${baseUrl}/dashboard/settings?tab=payments&refresh=true`,
        `${baseUrl}/dashboard/settings?tab=payments&success=true`
      );

      walletData.stripe_account_id = account.id;
      onboardingUrl = accountLink.url;
    }

    // Handle Flutterwave
    if (provider === 'flutterwave') {
      if (!isFlutterwaveConfigured()) {
        return NextResponse.json(
          { error: 'Flutterwave is not configured' },
          { status: 500 }
        );
      }

      if (!accountBank || !accountNumber) {
        return NextResponse.json(
          { error: 'Bank details required for Flutterwave' },
          { status: 400 }
        );
      }

      const subaccount = await createSubaccount({
        businessName: businessName || photographer.business_name || photographer.display_name,
        email: photographer.email,
        country,
        accountBank,
        accountNumber,
        splitType: 'percentage',
        splitValue: 85, // Photographer gets 85%, platform gets 15%
        photographerId: user.id,
      });

      walletData.flutterwave_subaccount_id = subaccount.subaccount_id;
      walletData.status = 'active';
      walletData.payouts_enabled = true;
      walletData.charges_enabled = true;
      walletData.details_submitted = true;
    }

    // Handle PayPal (simple merchant ID storage)
    if (provider === 'paypal') {
      const { paypalEmail } = body;
      if (!paypalEmail) {
        return NextResponse.json(
          { error: 'PayPal email required' },
          { status: 400 }
        );
      }

      walletData.paypal_merchant_id = paypalEmail;
      walletData.status = 'active';
      walletData.payouts_enabled = true;
      walletData.charges_enabled = true;
      walletData.details_submitted = true;
    }

    // Handle Mobile Money (direct payout to mobile wallet)
    if (provider === 'momo') {
      const { momoNetwork, momoNumber } = body;
      if (!momoNetwork || !momoNumber) {
        return NextResponse.json(
          { error: 'Mobile money details required' },
          { status: 400 }
        );
      }

      // Store mobile money details for payouts
      // Platform collects payments, then pays out to this number
      walletData.momo_account_number = momoNumber;
      walletData.momo_provider = momoNetwork;
      walletData.status = 'active';
      walletData.payouts_enabled = true;
      walletData.charges_enabled = false; // Platform collects, not the photographer
      walletData.details_submitted = true;
    }

    // Create wallet record
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .insert(walletData)
      .select()
      .single();

    if (walletError) {
      console.error('Failed to create wallet:', walletError);
      return NextResponse.json(
        { error: 'Failed to create wallet' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      wallet,
      onboardingUrl,
    });
  } catch (error) {
    console.error('Wallet onboard error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to onboard wallet' },
      { status: 500 }
    );
  }
}

