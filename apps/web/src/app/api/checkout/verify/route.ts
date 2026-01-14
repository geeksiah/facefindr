import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCheckoutSession } from '@/lib/payments/stripe';
import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { getOrder } from '@/lib/payments/paypal';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const txRef = searchParams.get('tx_ref');
    const orderId = searchParams.get('order_id');
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
    } else if (provider === 'paypal' && orderId) {
      const order = await getOrder(orderId);
      
      if (order.status !== 'COMPLETED') {
        return NextResponse.json(
          { error: 'Payment not completed' },
          { status: 400 }
        );
      }

      const { data } = await supabase
        .from('transactions')
        .select('*, events(name)')
        .eq('paypal_order_id', orderId)
        .single();

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
