/**
 * Mobile Money Account Verification API
 * 
 * Verifies a mobile money account and returns the account holder's name.
 * Uses Flutterwave and Paystack APIs for name resolution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyMobileMoneyAccount } from '@/lib/payments/payment-methods';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { phoneNumber, providerCode, countryCode } = body;

    if (!phoneNumber || !providerCode) {
      return NextResponse.json(
        { error: 'Phone number and provider are required' },
        { status: 400 }
      );
    }

    // Clean the phone number
    const cleanNumber = phoneNumber.replace(/\D/g, '');

    if (cleanNumber.length < 9 || cleanNumber.length > 12) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Verify the account
    const result = await verifyMobileMoneyAccount(cleanNumber, providerCode, countryCode || 'GH');

    if (result.success && result.accountName) {
      return NextResponse.json({
        success: true,
        verified: true,
        accountName: result.accountName,
        phoneNumber: cleanNumber,
      });
    }

    // Return without error - verification not available but not a failure
    return NextResponse.json({
      success: true,
      verified: false,
      message: 'Account verification not available for this provider',
      phoneNumber: cleanNumber,
    });

  } catch (error) {
    console.error('MoMo verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
