export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { constructWebhookEvent } from '@/lib/payments/stripe';
import { createServiceClient } from '@/lib/supabase/server';


const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const event = constructWebhookEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    const supabase = createServiceClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(supabase, session);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSuccess(supabase, paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(supabase, paymentIntent);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(supabase, charge);
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await handleAccountUpdate(supabase, account);
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook failed' },
      { status: 400 }
    );
  }
}

async function handleCheckoutComplete(
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session
) {
  const { payment_intent, metadata } = session;

  if (!payment_intent || !metadata?.event_id) {
    console.error('Missing payment_intent or event_id in checkout session');
    return;
  }

  // Update transaction with payment intent ID
  const { error } = await supabase
    .from('transactions')
    .update({
      stripe_payment_intent_id: payment_intent as string,
      status: 'succeeded',
    })
    .eq('stripe_checkout_session_id', session.id);

  if (error) {
    console.error('Failed to update transaction:', error);
    return;
  }

  // Create entitlements for purchased photos
  await createEntitlements(supabase, session.id, metadata);
}

async function handlePaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const { error } = await supabase
    .from('transactions')
    .update({ status: 'succeeded' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (error) {
    console.error('Failed to update transaction status:', error);
  }
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createServiceClient>,
  paymentIntent: Stripe.PaymentIntent
) {
  const { error } = await supabase
    .from('transactions')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  if (error) {
    console.error('Failed to update transaction status:', error);
  }
}

async function handleRefund(
  supabase: ReturnType<typeof createServiceClient>,
  charge: Stripe.Charge
) {
  const paymentIntentId = charge.payment_intent as string;

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'refunded' })
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (error) {
    console.error('Failed to update transaction for refund:', error);
  }

  // Remove entitlements for refunded transaction
  const { data: transaction } = await supabase
    .from('transactions')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (transaction) {
    await supabase.from('entitlements').delete().eq('transaction_id', transaction.id);
  }
}

async function handleAccountUpdate(
  supabase: ReturnType<typeof createServiceClient>,
  account: Stripe.Account
) {
  const { error } = await supabase
    .from('wallets')
    .update({
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      status: account.charges_enabled ? 'active' : 'pending',
    })
    .eq('stripe_account_id', account.id);

  if (error) {
    console.error('Failed to update wallet from account update:', error);
  }
}

async function createEntitlements(
  supabase: ReturnType<typeof createServiceClient>,
  sessionId: string,
  metadata: Record<string, string>
) {
  // Get the transaction
  const { data: transaction } = await supabase
    .from('transactions')
    .select('id, event_id, attendee_id, metadata')
    .eq('stripe_checkout_session_id', sessionId)
    .single();

  if (!transaction) {
    console.error('Transaction not found for entitlements');
    return;
  }

  const txMetadata = transaction.metadata as {
    media_ids?: string[];
    unlock_all?: boolean;
  };
  const unlockAll = metadata.unlock_all === 'true' || txMetadata?.unlock_all;
  const mediaIds = metadata.media_ids?.split(',').filter(Boolean) || txMetadata?.media_ids || [];

  if (unlockAll) {
    // Create bulk entitlement for all event photos
    await supabase.from('entitlements').insert({
      event_id: transaction.event_id,
      transaction_id: transaction.id,
      attendee_id: transaction.attendee_id,
      entitlement_type: 'bulk',
    });
  } else if (mediaIds.length > 0) {
    // Create individual entitlements
    const entitlements = mediaIds.map((mediaId: string) => ({
      event_id: transaction.event_id,
      transaction_id: transaction.id,
      attendee_id: transaction.attendee_id,
      media_id: mediaId,
      entitlement_type: 'single' as const,
    }));

    await supabase.from('entitlements').insert(entitlements);
  }
}

