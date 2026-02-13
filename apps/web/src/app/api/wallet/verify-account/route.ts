export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { verifyMobileMoneyAccount } from '@/lib/payments/payment-methods';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = String(body.provider || '').toLowerCase();

    if (provider === 'momo') {
      const momoNumber = String(body.momoNumber || '').trim();
      const momoNetwork = String(body.momoNetwork || '').trim().toUpperCase();
      const country = String(body.country || 'GH').trim().toUpperCase();

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

    if (provider === 'flutterwave') {
      const accountNumber = String(body.accountNumber || '').trim();
      const accountBank = String(body.accountBank || '').trim();

      if (!accountNumber || !accountBank) {
        return NextResponse.json({ error: 'Bank code and account number are required' }, { status: 400 });
      }

      const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!flutterwaveSecretKey) {
        return NextResponse.json({ error: 'Account verification is not configured' }, { status: 503 });
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
        return NextResponse.json(
          { error: data?.message || 'Could not verify bank account details' },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        accountName: String(accountName),
      });
    }

    return NextResponse.json({ error: 'Unsupported provider for account verification' }, { status: 400 });
  } catch (error) {
    console.error('Wallet account verification error:', error);
    return NextResponse.json({ error: 'Failed to verify account details' }, { status: 500 });
  }
}
