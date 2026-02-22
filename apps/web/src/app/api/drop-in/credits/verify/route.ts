export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { incrementDropInCredits } from '@/lib/drop-in/credits';
import { recordDropInCreditPurchaseJournal } from '@/lib/payments/financial-flow-ledger';
import { verifyPaystackTransaction, resolvePaystackSecretKey } from '@/lib/payments/paystack';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mapCurrencyToRegionCode(currency: string): string | null {
  switch (currency.trim().toUpperCase()) {
    case 'GHS':
      return 'GH';
    case 'NGN':
      return 'NG';
    case 'ZAR':
      return 'ZA';
    case 'KES':
      return 'KE';
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const purchaseId = asString(payload.purchaseId);
    const provider = asString(payload.provider || 'paystack').toLowerCase();
    const reference = asString(payload.reference);

    if (!purchaseId) {
      return NextResponse.json({ error: 'purchaseId is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data: attendee } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
    if (!attendee?.id) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }

    const { data: purchase, error: purchaseError } = await serviceClient
      .from('drop_in_credit_purchases')
      .select('id, attendee_id, credits_purchased, credits_remaining, amount_paid, currency, status, payment_intent_id')
      .eq('id', purchaseId)
      .eq('attendee_id', attendee.id)
      .maybeSingle();

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: 'Credit purchase not found' }, { status: 404 });
    }

    if (purchase.status === 'active' || purchase.status === 'exhausted') {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        creditsAdded: 0,
      });
    }

    if (provider !== 'paystack') {
      return NextResponse.json(
        { error: `Verification is not supported for provider ${provider}` },
        { status: 400 }
      );
    }

    const verifyReference = reference || asString(purchase.payment_intent_id);
    if (!verifyReference) {
      return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });
    }

    const { data: attendeeRegion } = await serviceClient
      .from('attendees')
      .select('country_code')
      .eq('id', attendee.id)
      .maybeSingle();

    const candidateRegionCodes = [
      asString((attendeeRegion as any)?.country_code).toUpperCase(),
      mapCurrencyToRegionCode(asString(purchase.currency)) || '',
    ].filter(Boolean);

    let secretKey: string | null = null;
    for (const regionCode of [...candidateRegionCodes, undefined]) {
      secretKey = await resolvePaystackSecretKey(regionCode || undefined);
      if (secretKey) break;
    }

    if (!secretKey) {
      return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
    }

    const verified = await verifyPaystackTransaction(verifyReference, secretKey);
    if (verified.status !== 'success') {
      return NextResponse.json({ error: 'Payment is not successful yet' }, { status: 400 });
    }

    if (Number(verified.amount || 0) < Number(purchase.amount_paid || 0)) {
      return NextResponse.json({ error: 'Paid amount is lower than expected amount' }, { status: 400 });
    }

    const { data: activated } = await serviceClient
      .from('drop_in_credit_purchases')
      .update({
        status: 'active',
        credits_remaining: purchase.credits_purchased,
        payment_intent_id: verifyReference,
      })
      .eq('id', purchase.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!activated?.id) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        creditsAdded: 0,
      });
    }

    const totalCredits = await incrementDropInCredits(
      serviceClient,
      attendee.id,
      Number(purchase.credits_purchased || 0)
    );

    const amountMinor = Math.max(0, Math.round(Number(purchase.amount_paid || 0)));
    if (amountMinor > 0) {
      await recordDropInCreditPurchaseJournal(serviceClient, {
        purchaseId: purchase.id,
        attendeeId: attendee.id,
        amountMinor,
        currency: String(purchase.currency || verified.currency || 'USD').toUpperCase(),
        provider: 'paystack',
        metadata: {
          paystack_reference: verifyReference,
          paystack_transaction_id: verified.id ? String(verified.id) : null,
          verification_source: 'drop_in.credits.verify.api',
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record verify drop-in credit purchase journal:', ledgerError);
      });
    }

    return NextResponse.json({
      success: true,
      creditsAdded: purchase.credits_purchased,
      totalCredits,
    });
  } catch (error: any) {
    console.error('Drop-in credit verification error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to verify drop-in credit purchase' },
      { status: 500 }
    );
  }
}
