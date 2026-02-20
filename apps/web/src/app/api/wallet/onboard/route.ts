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
import {
  createPaystackSubaccount,
  normalizePaystackSubaccountCode,
  resolvePaystackSecretKey,
  validatePaystackSubaccount,
  verifyPaystackBankAccount,
} from '@/lib/payments/paystack';
import { verifyMtnWalletActive } from '@/lib/payments/mtn-momo';
import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const SUPPORTED_REGION_GATEWAYS = new Set([
  'stripe',
  'flutterwave',
  'paypal',
  'paystack',
]);

const REGION_PROVIDER_ALIAS: Record<string, string> = {
  mtn_momo: 'flutterwave',
  vodafone_cash: 'flutterwave',
  airteltigo_money: 'flutterwave',
  mpesa: 'flutterwave',
};

function normalizeRegionProviders(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .map((value) => REGION_PROVIDER_ALIAS[value] || value)
    .filter((value) => SUPPORTED_REGION_GATEWAYS.has(value));
  return Array.from(new Set(normalized));
}

async function ensureProviderEnabledForRegion(
  serviceClient: ReturnType<typeof createServiceClient>,
  provider: string,
  countryCode: string
) {
  const gatewayProvider = provider === 'momo' ? 'flutterwave' : provider;
  const normalizedProvider = String(gatewayProvider || '').trim().toLowerCase();
  if (!SUPPORTED_REGION_GATEWAYS.has(normalizedProvider)) {
    return {
      allowed: false,
      error: `Unsupported payment provider: ${provider}`,
      status: 400,
    };
  }

  const { data: regionConfig, error } = await serviceClient
    .from('region_config')
    .select('is_active, payment_providers')
    .eq('region_code', countryCode)
    .maybeSingle();

  if (error || !regionConfig) {
    return {
      allowed: false,
      error: `No active region configuration found for ${countryCode}`,
      status: 503,
    };
  }

  if (!regionConfig.is_active) {
    return {
      allowed: false,
      error: `Region ${countryCode} is disabled`,
      status: 403,
    };
  }

  const enabledProviders = normalizeRegionProviders(regionConfig.payment_providers);
  if (!enabledProviders.includes(normalizedProvider)) {
    return {
      allowed: false,
      error: `${provider} is not enabled for region ${countryCode}`,
      status: 403,
    };
  }

  return { allowed: true, status: 200 };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
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
      // Paystack specific
      paystackSubaccountCode,
    } = body;
    const normalizedCountry = String(country || '')
      .trim()
      .toUpperCase();

    if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
      return NextResponse.json(
        { error: 'A valid 2-letter country code is required' },
        { status: 400 }
      );
    }

    const providerAccess = await ensureProviderEnabledForRegion(
      serviceClient,
      String(provider || '').toLowerCase(),
      normalizedCountry
    );
    if (!providerAccess.allowed) {
      return NextResponse.json(
        { error: providerAccess.error },
        { status: providerAccess.status }
      );
    }

    // Get photographer profile
    const { data: photographer } = await resolvePhotographerProfileByUser(serviceClient, user.id, user.email);
    if (!photographer) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404 }
      );
    }
    const photographerId = photographer.id as string;
    const { data: photographerDetails } = await serviceClient
      .from('photographers')
      .select('id, email, display_name, business_name')
      .eq('id', photographerId)
      .maybeSingle();
    const photographerIdCandidates = await getPhotographerIdCandidates(serviceClient, user.id, user.email);

    // Check for existing wallet with this provider
    const { data: existingWallet } = await serviceClient
      .from('wallets')
      .select('id, status, stripe_account_id')
      .in('photographer_id', photographerIdCandidates)
      .eq('provider', provider)
      .single();

    if (existingWallet) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        request.headers.get('origin') ||
        'http://localhost:3000';

      if (
        provider === 'stripe' &&
        existingWallet.status !== 'active' &&
        existingWallet.stripe_account_id &&
        isStripeConfigured()
      ) {
        const accountLink = await createAccountLink(
          existingWallet.stripe_account_id,
          `${baseUrl}/dashboard/settings?tab=payments&refresh=true`,
          `${baseUrl}/dashboard/settings?tab=payments&success=true`
        );
        return NextResponse.json({
          wallet: existingWallet,
          onboardingUrl: accountLink.url,
        });
      }

      if (provider === 'paypal' && existingWallet.status === 'pending') {
        return NextResponse.json({
          wallet: existingWallet,
            onboardingUrl: `${baseUrl}/api/wallet/paypal/connect?country=${encodeURIComponent(
            normalizedCountry || 'US'
          )}`,
        });
      }
      return NextResponse.json(
        { error: 'Wallet already exists for this provider', wallet: existingWallet },
        { status: 400 }
      );
    }

    const { data: regionConfig } = await serviceClient
      .from('region_config')
      .select('default_currency')
      .eq('region_code', normalizedCountry)
      .maybeSingle();

    const walletData: Record<string, unknown> = {
      photographer_id: photographerId,
      provider,
      country_code: normalizedCountry,
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
        email: (photographerDetails as any)?.email || user.email,
        country: normalizedCountry,
        businessName: businessName || (photographerDetails as any)?.business_name,
        photographerId,
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
        businessName:
          businessName ||
          (photographerDetails as any)?.business_name ||
          (photographerDetails as any)?.display_name,
        email: (photographerDetails as any)?.email || user.email,
        country,
        accountBank,
        accountNumber,
        splitType: 'percentage',
        splitValue: 85, // Creator gets 85%, platform gets 15%
        photographerId,
      });

      walletData.flutterwave_subaccount_id = subaccount.subaccount_id;
      walletData.status = 'active';
      walletData.payouts_enabled = true;
      walletData.charges_enabled = true;
      walletData.details_submitted = true;
    }

    // Handle PayPal via OAuth wallet link flow
    if (provider === 'paypal') {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        request.headers.get('origin') ||
        'http://localhost:3000';
      return NextResponse.json({
        onboardingUrl: `${baseUrl}/api/wallet/paypal/connect?country=${encodeURIComponent(
          normalizedCountry || 'US'
        )}`,
      });
    }

    // Handle Paystack
    if (provider === 'paystack') {
      const paystackSecretKey = await resolvePaystackSecretKey(normalizedCountry);
      if (!paystackSecretKey) {
        return NextResponse.json(
          { error: 'Paystack is not configured' },
          { status: 500 }
        );
      }

      const rawSubaccountCode =
        typeof paystackSubaccountCode === 'string'
          ? paystackSubaccountCode.trim()
          : '';
      const normalizedSubaccountCode =
        normalizePaystackSubaccountCode(rawSubaccountCode);
      const normalizedAccountBank = String(accountBank || '').trim();
      const normalizedAccountNumber = String(accountNumber || '')
        .replace(/\s+/g, '')
        .trim();

      if (rawSubaccountCode && !normalizedSubaccountCode) {
        return NextResponse.json(
          {
            error:
              'Invalid Paystack subaccount code. Use a code like ACCT_xxxxxxxx or leave it blank.',
          },
          { status: 400 }
        );
      }

      if (normalizedSubaccountCode) {
        try {
          const validation = await validatePaystackSubaccount(
            normalizedSubaccountCode,
            paystackSecretKey
          );
          if (!validation.valid) {
            return NextResponse.json(
              {
                error:
                  validation.message ||
                  'Invalid Paystack subaccount. Please confirm your ACCT code.',
              },
              { status: 400 }
            );
          }
        } catch (validationError) {
          console.error(
            'Failed to validate Paystack subaccount:',
            validationError
          );
          return NextResponse.json(
            {
              error:
                'Unable to verify Paystack subaccount right now. Leave it blank or try again.',
            },
            { status: 502 }
          );
        }
        walletData.paystack_subaccount_code = normalizedSubaccountCode;
      } else {
        if (!normalizedAccountBank || !normalizedAccountNumber) {
          return NextResponse.json(
            {
              error:
                'Bank selection and account number are required for Paystack. Creators should add regular account details, not ACCT code.',
            },
            { status: 400 }
          );
        }

        const verification = await verifyPaystackBankAccount(
          normalizedAccountNumber,
          normalizedAccountBank,
          paystackSecretKey
        );

        if (!verification.valid) {
          return NextResponse.json(
            {
              error:
                verification.message ||
                'Could not verify account details with Paystack.',
            },
            { status: 422 }
          );
        }

        try {
          const subaccount = await createPaystackSubaccount(
            {
              businessName:
                businessName ||
                (photographerDetails as any)?.business_name ||
                (photographerDetails as any)?.display_name ||
                'Creator Wallet',
              settlementBank: normalizedAccountBank,
              accountNumber: normalizedAccountNumber,
              description: `Creator payouts (${photographerId})`,
              primaryContactEmail:
                (photographerDetails as any)?.email || user.email || undefined,
              primaryContactName:
                (photographerDetails as any)?.display_name || undefined,
            },
            paystackSecretKey
          );

          walletData.paystack_subaccount_code = subaccount.subaccountCode;
        } catch (paystackError) {
          console.error('Failed to create Paystack subaccount:', paystackError);
          return NextResponse.json(
            {
              error:
                paystackError instanceof Error
                  ? paystackError.message
                  : 'Failed to create Paystack payout account',
            },
            { status: 422 }
          );
        }
      }

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

      if (String(momoNetwork).toUpperCase() === 'MTN') {
        const verification = await verifyMtnWalletActive(momoNumber, normalizedCountry || 'GH');
        if (!verification.valid) {
          return NextResponse.json(
            { error: verification.message || 'Unable to verify MTN wallet' },
            { status: 422 }
          );
        }
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
    const { data: wallet, error: walletError } = await serviceClient
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

