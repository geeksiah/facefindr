export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { verifyMobileMoneyAccount } from '@/lib/payments/payment-methods';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

type VerificationResult =
  | { success: true; accountName: string }
  | { success: false; error: string; status?: number };

async function resolveWithFlutterwave(accountNumber: string, accountBank: string): Promise<VerificationResult> {
  const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!flutterwaveSecretKey) {
    return { success: false, error: 'Flutterwave verification is not configured', status: 503 };
  }

  const response = await fetch('https://api.flutterwave.com/v3/accounts/resolve', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${flutterwaveSecretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_number: accountNumber,
      account_bank: accountBank,
    }),
  });

  const data = await response.json();
  const accountName = data?.data?.account_name;
  if (!response.ok || !accountName) {
    return {
      success: false,
      error: data?.message || 'Could not verify bank account details via Flutterwave',
      status: 422,
    };
  }

  return { success: true, accountName: String(accountName) };
}

async function resolveWithPaystack(accountNumber: string, accountBank: string): Promise<VerificationResult> {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecretKey) {
    return { success: false, error: 'Paystack verification is not configured', status: 503 };
  }

  const response = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(accountBank)}`,
    {
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
      },
    }
  );

  const data = await response.json();
  const accountName = data?.data?.account_name;
  if (!response.ok || !data?.status || !accountName) {
    return {
      success: false,
      error: data?.message || 'Could not verify bank account details via Paystack',
      status: 422,
    };
  }

  return { success: true, accountName: String(accountName) };
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
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

    const body = await request.json();
    const provider = String(body.provider || '').toLowerCase();
    const country = String(body.country || 'GH').trim().toUpperCase();

    if (provider === 'momo') {
      const momoNumber = String(body.momoNumber || '').trim();
      const momoNetwork = String(body.momoNetwork || '').trim().toUpperCase();

      if (!momoNumber || !momoNetwork) {
        return NextResponse.json({ error: 'Mobile network and number are required' }, { status: 400 });
      }

      const providerCodeMap: Record<string, string> = {
        MTN: `mtn_${country.toLowerCase()}`,
        VODAFONE: `vodafone_${country.toLowerCase()}`,
        AIRTEL: `airtel_${country.toLowerCase()}`,
        TIGO: `tigo_${country.toLowerCase()}`,
      };

      const providerCode = providerCodeMap[momoNetwork];
      if (!providerCode) {
        return NextResponse.json({ error: 'Unsupported mobile network for verification' }, { status: 400 });
      }

      const verification = await verifyMobileMoneyAccount(momoNumber, providerCode, country);
      if (!verification.success || !verification.accountName) {
        return NextResponse.json(
          { error: verification.error || 'Could not verify mobile money account' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        accountName: verification.accountName,
      });
    }

    if (provider === 'flutterwave' || provider === 'paystack' || provider === 'bank' || provider === 'auto') {
      const accountNumber = String(body.accountNumber || '').trim();
      const accountBank = String(body.accountBank || '').trim();

      if (!accountNumber || !accountBank) {
        return NextResponse.json({ error: 'Bank code and account number are required' }, { status: 400 });
      }

      let result: VerificationResult;
      if (provider === 'paystack') {
        result = await resolveWithPaystack(accountNumber, accountBank);
      } else if (provider === 'flutterwave') {
        result = await resolveWithFlutterwave(accountNumber, accountBank);
      } else {
        const primary = country === 'NG' ? 'paystack' : 'flutterwave';
        const primaryResult =
          primary === 'paystack'
            ? await resolveWithPaystack(accountNumber, accountBank)
            : await resolveWithFlutterwave(accountNumber, accountBank);

        if (primaryResult.success) {
          result = primaryResult;
        } else {
          const fallbackResult =
            primary === 'paystack'
              ? await resolveWithFlutterwave(accountNumber, accountBank)
              : await resolveWithPaystack(accountNumber, accountBank);
          result = fallbackResult.success ? fallbackResult : primaryResult;
        }
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: result.status || 422 });
      }

      return NextResponse.json({
        success: true,
        accountName: result.accountName,
      });
    }

    return NextResponse.json({ error: 'Unsupported provider for account verification' }, { status: 400 });
  } catch (error) {
    console.error('Wallet account verification error', {
      requestId,
      error,
    });
    return NextResponse.json({ error: 'Failed to verify account details' }, { status: 500 });
  }
}
