export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { resolvePaystackSecretKey, verifyPaystackTransaction } from '@/lib/payments/paystack';
import { getOrder } from '@/lib/payments/paypal';
import { getCheckoutSession } from '@/lib/payments/stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type TipRecord = {
  id: string;
  from_user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripe_payment_intent_id: string | null;
  photographers?: {
    display_name: string;
    country_code?: string | null;
  } | null;
  events?: {
    country_code?: string | null;
  } | null;
};

export async function GET(request: NextRequest) {
  try {
    const tipId = request.nextUrl.searchParams.get('tip_id');
    const provider = request.nextUrl.searchParams.get('provider') || 'stripe';
    const sessionId = request.nextUrl.searchParams.get('session_id');
    const txRef = request.nextUrl.searchParams.get('tx_ref');
    const orderId = request.nextUrl.searchParams.get('order_id');
    const paypalToken = request.nextUrl.searchParams.get('token');
    const reference = request.nextUrl.searchParams.get('reference');

    if (!tipId) {
      return NextResponse.json({ error: 'tip_id is required' }, { status: 400 });
    }

    const supabase = createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tipData, error: tipError } = await serviceClient
      .from('tips')
      .select(`
        id,
        from_user_id,
        amount,
        currency,
        status,
        stripe_payment_intent_id,
        photographers!tips_to_photographer_id_fkey (
          display_name,
          country_code
        ),
        events!tips_event_id_fkey (
          country_code
        )
      `)
      .eq('id', tipId)
      .single();

    if (tipError || !tipData) {
      return NextResponse.json({ error: 'Tip not found' }, { status: 404 });
    }

    const tip = tipData as TipRecord;
    if (tip.from_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (tip.status === 'completed') {
      return NextResponse.json({
        tipId: tip.id,
        status: tip.status,
        amount: tip.amount,
        currency: tip.currency,
        photographerName: tip.photographers?.display_name || 'Creator',
      });
    }

    let verified = false;
    let resolvedReference: string | null = null;

    if (provider === 'stripe') {
      if (!sessionId) {
        return NextResponse.json({ error: 'session_id is required for Stripe verification' }, { status: 400 });
      }
      const session = await getCheckoutSession(sessionId);
      verified = session.payment_status === 'paid';
      resolvedReference =
        (typeof session.payment_intent === 'string' ? session.payment_intent : null) || session.id;
    } else if (provider === 'flutterwave') {
      if (!txRef) {
        return NextResponse.json({ error: 'tx_ref is required for Flutterwave verification' }, { status: 400 });
      }
      const flwTx = await verifyTransactionByRef(txRef);
      verified = flwTx.status === 'successful';
      resolvedReference = txRef;
    } else if (provider === 'paypal') {
      const paypalOrderId = paypalToken || orderId || tip.stripe_payment_intent_id;
      if (!paypalOrderId) {
        return NextResponse.json({ error: 'order_id or token is required for PayPal verification' }, { status: 400 });
      }
      const order = await getOrder(paypalOrderId);
      verified = order.status === 'COMPLETED' || order.status === 'APPROVED';
      resolvedReference = paypalOrderId;
    } else if (provider === 'paystack') {
      const paystackReference = reference || tip.stripe_payment_intent_id;
      if (!paystackReference) {
        return NextResponse.json({ error: 'reference is required for Paystack verification' }, { status: 400 });
      }
      const regionCode = tip.events?.country_code || tip.photographers?.country_code || undefined;
      const paystackSecretKey = await resolvePaystackSecretKey(regionCode || undefined);
      const paystackTx = await verifyPaystackTransaction(paystackReference, paystackSecretKey || undefined);
      verified = paystackTx.status === 'success';
      resolvedReference = paystackReference;
    } else {
      return NextResponse.json({ error: 'Unsupported payment provider' }, { status: 400 });
    }

    if (!verified) {
      return NextResponse.json({ error: 'Payment not completed yet' }, { status: 400 });
    }

    const { error: updateError } = await serviceClient
      .from('tips')
      .update({
        status: 'completed',
        ...(resolvedReference ? { stripe_payment_intent_id: resolvedReference } : {}),
      })
      .eq('id', tip.id);

    if (updateError) {
      console.error('Failed to update tip status:', updateError);
      return NextResponse.json({ error: 'Failed to finalize tip status' }, { status: 500 });
    }

    const transactionUpdate: Record<string, unknown> = {
      status: 'succeeded',
    };
    if (provider === 'stripe' && resolvedReference) {
      transactionUpdate.stripe_payment_intent_id = resolvedReference;
    }
    if (provider === 'flutterwave' && resolvedReference) {
      transactionUpdate.flutterwave_tx_ref = resolvedReference;
    }
    if (provider === 'paypal' && resolvedReference) {
      transactionUpdate.paypal_order_id = resolvedReference;
    }
    if (provider === 'paystack' && resolvedReference) {
      transactionUpdate.paystack_reference = resolvedReference;
    }

    const { error: txUpdateError } = await serviceClient
      .from('transactions')
      .update(transactionUpdate)
      .contains('metadata', { tip_id: tip.id });

    if (txUpdateError) {
      console.error('Failed to update tip transaction after verification:', txUpdateError);
    }

    return NextResponse.json({
      tipId: tip.id,
      status: 'completed',
      amount: tip.amount,
      currency: tip.currency,
      photographerName: tip.photographers?.display_name || 'Creator',
    });
  } catch (error) {
    console.error('Tip verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tip verification failed' },
      { status: 500 }
    );
  }
}
