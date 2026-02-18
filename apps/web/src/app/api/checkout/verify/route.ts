export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { resolvePaystackSecretKey, verifyPaystackTransaction } from '@/lib/payments/paystack';
import { getOrder } from '@/lib/payments/paypal';
import { getCheckoutSession } from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const txRef = searchParams.get('tx_ref');
    const orderId = searchParams.get('order_id');
    const token = searchParams.get('token');
    const reference = searchParams.get('reference');
    const provider = searchParams.get('provider') || 'stripe';

    const supabase = await createClient();

    let transaction;

    // Verify with the appropriate provider
    if (provider === 'stripe' && sessionId) {
      const session = await getCheckoutSession(sessionId);
      
      if (session.payment_status !== 'paid') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }

      const { data } = await supabase
        .from('transactions')
        .select('*, events(name)')
        .eq('stripe_checkout_session_id', sessionId)
        .single();

      transaction = data;
    } else if (provider === 'flutterwave' && txRef) {
      const flwTx = await verifyTransactionByRef(txRef);
      
      if (flwTx.status !== 'successful') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }

      const { data } = await supabase
        .from('transactions')
        .select('*, events(name)')
        .eq('flutterwave_tx_ref', txRef)
        .single();

      transaction = data;
    } else if (provider === 'paypal' && (token || orderId)) {
      const paypalOrderId = token || orderId;
      const order = await getOrder(paypalOrderId!);
      
      if (order.status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }

      const { data } = await supabase
        .from('transactions')
        .select('*, events(name)')
        .eq('paypal_order_id', paypalOrderId!)
        .single();

      transaction = data;
    } else if (provider === 'paystack' && reference) {
      const { data } = await (supabase
        .from('transactions') as any)
        .select('*, events(name, country_code)')
        .eq('paystack_reference', reference)
        .single();

      if (!data) {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        );
      }

      const regionCode = data.events?.country_code as string | undefined;
      const paystackSecretKey = await resolvePaystackSecretKey(regionCode);
      const paystackTx = await verifyPaystackTransaction(reference, paystackSecretKey || undefined);

      if (paystackTx.status !== 'success') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }

      transaction = data;
    } else {
      return NextResponse.json(
        { error: 'Invalid verification parameters' },
        { status: 400 }
      );
    }

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Get photo count from metadata
    const metadata = transaction.metadata as {
      media_ids?: string[];
      unlock_all?: boolean;
    };

    return NextResponse.json({
      eventId: transaction.event_id,
      eventName: transaction.events?.name || 'Event',
      photoCount: metadata?.media_ids?.length || 0,
      totalAmount: transaction.gross_amount,
      currency: transaction.currency,
      isUnlockAll: metadata?.unlock_all || false,
    });
  } catch (error) {
    console.error('Checkout verification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}

