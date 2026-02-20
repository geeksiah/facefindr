export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from '@/lib/payments/webhook-ledger';
import { addCard, getUserPaymentMethods } from '@/lib/payments/payment-methods';
import { stripe } from '@/lib/payments/stripe';
import { creditWalletFromTransaction } from '@/lib/payments/wallet-balance';
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
    const claim = await claimWebhookEvent({
      supabase,
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      signatureVerified: true,
      payload: event,
    });

    if (!claim.shouldProcess) {
      return NextResponse.json({
        received: true,
        replay: true,
        status: claim.status,
      });
    }

    try {
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

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionLifecycle(supabase, subscription, event.type);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await handleSubscriptionInvoiceFailed(supabase, invoice);
          break;
        }

        default:
          console.log(`Unhandled Stripe event: ${event.type}`);
      }

      if (claim.rowId) {
        await markWebhookProcessed(supabase, claim.rowId);
      }
    } catch (processingError) {
      if (claim.rowId) {
        await markWebhookFailed(
          supabase,
          claim.rowId,
          processingError instanceof Error ? processingError.message : 'Stripe webhook processing failed'
        );
      }
      throw processingError;
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
  if (session.mode === 'setup') {
    const userId = session.metadata?.user_id;
    const setupIntentId =
      typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id;
    if (userId && setupIntentId && stripe) {
      try {
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId =
          typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;

        if (paymentMethodId) {
          const existingMethods = await getUserPaymentMethods(userId);
          await addCard(userId, {
            stripePaymentMethodId: paymentMethodId,
            setAsDefault: existingMethods.length === 0,
          });
        }
      } catch (error) {
        console.error('Failed to persist setup-mode card payment method:', error);
      }
    }
    return;
  }

  const { payment_intent, metadata } = session;
  if (metadata?.type === 'drop_in_upload') {
    await handleDropInPaymentSuccess(supabase, {
      dropInPhotoId: metadata.drop_in_photo_id || '',
      attendeeId: metadata.attendee_id || '',
      includeGift: metadata.include_gift === 'true',
      transactionRef:
        (typeof payment_intent === 'string' ? payment_intent : null) || session.id,
    });
    return;
  }

  if (metadata?.tip_id) {
    await updateTipStatus(supabase, metadata.tip_id, 'completed', {
      stripe_payment_intent_id:
        (typeof payment_intent === 'string' ? payment_intent : null) || session.id,
    });
    return;
  }

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
  if (paymentIntent.metadata?.type === 'drop_in_upload') {
    await handleDropInPaymentSuccess(supabase, {
      dropInPhotoId: paymentIntent.metadata.drop_in_photo_id || '',
      attendeeId: paymentIntent.metadata.attendee_id || '',
      includeGift: paymentIntent.metadata.include_gift === 'true',
      transactionRef: paymentIntent.id,
    });
    return;
  }

  const tipId = paymentIntent.metadata?.tip_id;
  if (tipId) {
    await updateTipStatus(supabase, tipId, 'completed', {
      stripe_payment_intent_id: paymentIntent.id,
    });
    return;
  }

  await supabase
    .from('tips')
    .update({
      status: 'completed',
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .eq('status', 'pending');

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
  if (paymentIntent.metadata?.type === 'drop_in_upload') {
    await handleDropInPaymentFailure(
      supabase,
      paymentIntent.metadata.drop_in_photo_id || '',
      paymentIntent.metadata.include_gift === 'true'
    );
    return;
  }

  const tipId = paymentIntent.metadata?.tip_id;
  if (tipId) {
    await updateTipStatus(supabase, tipId, 'failed', {
      stripe_payment_intent_id: paymentIntent.id,
    });
    return;
  }

  await supabase
    .from('tips')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .eq('status', 'pending');

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
    await supabase.from('entitlements').delete().eq('purchase_id', transaction.id);
  }
}

async function updateTipStatus(
  supabase: ReturnType<typeof createServiceClient>,
  tipId: string,
  status: 'completed' | 'failed' | 'refunded',
  extra: Record<string, string | null> = {}
) {
  const { error } = await supabase
    .from('tips')
    .update({
      status,
      ...extra,
    })
    .eq('id', tipId);

  if (error) {
    console.error(`Failed to update tip ${tipId}:`, error);
  }

  const transactionStatus =
    status === 'completed' ? 'succeeded' : status === 'refunded' ? 'refunded' : 'failed';
  const transactionUpdate: Record<string, unknown> = {
    status: transactionStatus,
  };

  if (typeof extra.stripe_payment_intent_id === 'string' && extra.stripe_payment_intent_id) {
    transactionUpdate.stripe_payment_intent_id = extra.stripe_payment_intent_id;
  }

  const { error: txError } = await supabase
    .from('transactions')
    .update(transactionUpdate)
    .contains('metadata', { tip_id: tipId });

  if (txError) {
    console.error(`Failed to update tip transaction ledger ${tipId}:`, txError);
    return;
  }

  const { data: tipTransactions } = await supabase
    .from('transactions')
    .select('id')
    .contains('metadata', { tip_id: tipId });

  for (const transaction of tipTransactions || []) {
    await creditWalletFromTransaction(supabase, transaction.id);
  }
}

async function triggerDropInProcessing(dropInPhotoId: string) {
  if (!dropInPhotoId) return;
  const processSecret = process.env.DROP_IN_PROCESS_SECRET;
  if (!processSecret) return;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/drop-in/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-drop-in-process-secret': processSecret,
      },
      body: JSON.stringify({ dropInPhotoId }),
    });

    if (!response.ok) {
      console.error('Stripe drop-in processing trigger failed:', await response.text());
    }
  } catch (error) {
    console.error('Failed to trigger drop-in processing from Stripe webhook:', error);
  }
}

async function handleDropInPaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    dropInPhotoId: string;
    attendeeId: string;
    includeGift: boolean;
    transactionRef: string;
  }
) {
  if (!params.dropInPhotoId || !params.attendeeId) return;

  const { data: dropInPhoto } = await supabase
    .from('drop_in_photos')
    .select('id')
    .eq('id', params.dropInPhotoId)
    .eq('uploader_id', params.attendeeId)
    .eq('upload_payment_status', 'pending')
    .maybeSingle();

  if (!dropInPhoto) return;

  await supabase
    .from('drop_in_photos')
    .update({
      upload_payment_status: 'paid',
      upload_payment_transaction_id: params.transactionRef,
      ...(params.includeGift
        ? {
            gift_payment_status: 'paid',
            gift_payment_transaction_id: params.transactionRef,
          }
        : {}),
    })
    .eq('id', params.dropInPhotoId);

  await triggerDropInProcessing(params.dropInPhotoId);
}

async function handleDropInPaymentFailure(
  supabase: ReturnType<typeof createServiceClient>,
  dropInPhotoId: string,
  includeGift: boolean
) {
  if (!dropInPhotoId) return;

  await supabase
    .from('drop_in_photos')
    .update({
      upload_payment_status: 'failed',
      ...(includeGift ? { gift_payment_status: 'failed' } : {}),
    })
    .eq('id', dropInPhotoId);
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

  await creditWalletFromTransaction(supabase, transaction.id);

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
      purchase_id: transaction.id,
      attendee_id: transaction.attendee_id,
      entitlement_type: 'bulk',
    });
  } else if (mediaIds.length > 0) {
    // Create individual entitlements
    const entitlements = mediaIds.map((mediaId: string) => ({
      event_id: transaction.event_id,
      purchase_id: transaction.id,
      attendee_id: transaction.attendee_id,
      media_id: mediaId,
      entitlement_type: 'single' as const,
    }));

    await supabase.from('entitlements').insert(entitlements);
  }
}

function mapStripeStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return 'active';
  if (normalized === 'trialing') return 'trialing';
  if (normalized === 'past_due' || normalized === 'unpaid' || normalized === 'incomplete') {
    return 'past_due';
  }
  if (normalized.includes('cancel')) return 'canceled';
  return 'past_due';
}

function toIsoFromUnix(timestamp: number | null | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  return new Date(Number(timestamp) * 1000).toISOString();
}

async function handleSubscriptionLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: Stripe.Subscription,
  eventType: string
) {
  const metadata = (subscription.metadata || {}) as Record<string, string>;
  const scope = metadata.subscription_scope || metadata.type;
  const status = mapStripeStatus(subscription.status);
  const currentPeriodStart = toIsoFromUnix(subscription.current_period_start) || new Date().toISOString();
  const currentPeriodEnd = toIsoFromUnix(subscription.current_period_end);
  const canceledAt =
    subscription.cancel_at || subscription.canceled_at
      ? toIsoFromUnix(subscription.cancel_at || subscription.canceled_at || null)
      : null;
  const priceObj = subscription.items?.data?.[0]?.price;
  const currency = String(priceObj?.currency || 'usd').toUpperCase();
  const amountCents = Number(priceObj?.unit_amount || 0);

  if (scope === 'attendee_subscription' || metadata.attendee_id) {
    const attendeeId = metadata.attendee_id;
    if (!attendeeId) return;

    const planCode = metadata.plan_code || 'free';
    const isPremium = planCode === 'premium' || planCode === 'premium_plus';
    const isPremiumPlus = planCode === 'premium_plus';

    await supabase
      .from('attendee_subscriptions')
      .upsert(
        {
          attendee_id: attendeeId,
          plan_code: planCode,
          status,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
          payment_provider: 'stripe',
          external_subscription_id: subscription.id,
          external_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
          external_plan_id: metadata.provider_plan_id || priceObj?.id || null,
          billing_cycle: metadata.billing_cycle || 'monthly',
          currency,
          amount_cents: amountCents,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          canceled_at: canceledAt,
          last_webhook_event_at: new Date().toISOString(),
          metadata: {
            stripe_event: eventType,
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
            can_discover_non_contacts: isPremium,
            can_upload_drop_ins: isPremium,
            can_receive_all_drop_ins: isPremium,
            can_search_social_media: isPremiumPlus,
            can_search_web: isPremiumPlus,
          },
        },
        { onConflict: 'attendee_id' }
      )
      .throwOnError();
    return;
  }

  if (scope === 'vault_subscription' || metadata.plan_slug) {
    const userId = metadata.user_id;
    if (!userId) return;

    await supabase
      .from('storage_subscriptions')
      .upsert(
        {
          user_id: userId,
          plan_id: metadata.plan_id || null,
          status: status === 'canceled' ? 'cancelled' : status,
          billing_cycle: metadata.billing_cycle || 'monthly',
          price_paid: amountCents / 100,
          currency,
          payment_provider: 'stripe',
          external_subscription_id: subscription.id,
          external_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
          external_plan_id: metadata.provider_plan_id || priceObj?.id || null,
          amount_cents: amountCents,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancelled_at: canceledAt,
          last_webhook_event_at: new Date().toISOString(),
          metadata: {
            stripe_event: eventType,
            plan_slug: metadata.plan_slug || null,
          },
        },
        { onConflict: 'user_id' }
      )
      .throwOnError();

    await supabase.rpc('sync_subscription_limits', { p_user_id: userId }).catch(() => {});
    return;
  }

  const photographerId = metadata.photographer_id;
  if (!photographerId) return;

  await supabase
    .from('subscriptions')
    .upsert(
      {
        photographer_id: photographerId,
        plan_code: metadata.plan_code || 'free',
        status,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
        payment_provider: 'stripe',
        external_subscription_id: subscription.id,
        external_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
        external_plan_id: metadata.provider_plan_id || priceObj?.id || null,
        billing_cycle: metadata.billing_cycle || 'monthly',
        currency,
        amount_cents: amountCents,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        canceled_at: canceledAt,
        last_webhook_event_at: new Date().toISOString(),
        metadata: {
          stripe_event: eventType,
        },
      },
      { onConflict: 'photographer_id' }
    )
    .throwOnError();
}

async function handleSubscriptionInvoiceFailed(
  supabase: ReturnType<typeof createServiceClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
  if (!subscriptionId) return;

  await Promise.all([
    supabase
      .from('subscriptions')
      .update({ status: 'past_due', last_webhook_event_at: new Date().toISOString() })
      .eq('external_subscription_id', subscriptionId),
    supabase
      .from('attendee_subscriptions')
      .update({ status: 'past_due', last_webhook_event_at: new Date().toISOString() })
      .eq('external_subscription_id', subscriptionId),
    supabase
      .from('storage_subscriptions')
      .update({ status: 'past_due', last_webhook_event_at: new Date().toISOString() })
      .eq('external_subscription_id', subscriptionId),
  ]);
}

