export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyWebhook, captureOrder, getBillingSubscription } from '@/lib/payments/paypal';
import {
  parseMetadataRecord,
  readNumber,
  readString,
  syncRecurringSubscriptionRecord,
  type SubscriptionScope,
} from '@/lib/payments/recurring-sync';
import { mapProviderSubscriptionStatusToLocal } from '@/lib/payments/recurring-subscriptions';
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from '@/lib/payments/webhook-ledger';
import { creditWalletFromTransaction } from '@/lib/payments/wallet-balance';
import { createServiceClient } from '@/lib/supabase/server';

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  resource: {
    id: string;
    status?: string;
    custom_id?: string;
    plan_id?: string;
    subscriber?: {
      payer_id?: string;
      email_address?: string;
    };
    purchase_units?: Array<{
      reference_id: string;
      custom_id?: string;
      payments?: {
        captures?: Array<{
          id: string;
          status: string;
          amount: {
            currency_code: string;
            value: string;
          };
        }>;
      };
    }>;
    payer?: {
      email_address: string;
      payer_id: string;
    };
  };
}

export async function POST(request: Request) {
  if (!PAYPAL_WEBHOOK_ID) {
    console.error('PAYPAL_WEBHOOK_ID is not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    
    const webhookHeaders: Record<string, string> = {};
    [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-cert-url',
      'paypal-transmission-sig',
      'paypal-auth-algo',
    ].forEach((key) => {
      const value = headersList.get(key);
      if (value) webhookHeaders[key] = value;
    });

    // Verify webhook signature
    const isValid = await verifyWebhook(webhookHeaders, body, PAYPAL_WEBHOOK_ID);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const payload: PayPalWebhookPayload = JSON.parse(body);
    const supabase = createServiceClient();
    const claim = await claimWebhookEvent({
      supabase,
      provider: 'paypal',
      eventId: payload.id,
      eventType: payload.event_type,
      signatureVerified: true,
      payload,
    });

    if (!claim.shouldProcess) {
      return NextResponse.json({
        received: true,
        replay: true,
        status: claim.status,
      });
    }

    try {
      switch (payload.event_type) {
        case 'CHECKOUT.ORDER.APPROVED': {
          await handleOrderApproved(supabase, payload.resource);
          break;
        }

        case 'PAYMENT.CAPTURE.COMPLETED': {
          await handleCaptureCompleted(supabase, payload.resource);
          break;
        }

        case 'PAYMENT.CAPTURE.DENIED':
        case 'PAYMENT.CAPTURE.REFUNDED': {
          await handleCaptureFailed(supabase, payload.resource, payload.event_type);
          break;
        }

        case 'BILLING.SUBSCRIPTION.CREATED':
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
        case 'BILLING.SUBSCRIPTION.UPDATED':
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
        case 'BILLING.SUBSCRIPTION.CANCELLED':
        case 'BILLING.SUBSCRIPTION.EXPIRED': {
          await handleSubscriptionLifecycle(supabase, payload.resource, payload.event_type);
          break;
        }

        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
          await handleSubscriptionPaymentFailure(supabase, payload.resource, payload.event_type);
          break;
        }

        default:
          console.log(`Unhandled PayPal event: ${payload.event_type}`);
      }

      if (claim.rowId) {
        await markWebhookProcessed(supabase, claim.rowId);
      }
    } catch (processingError) {
      if (claim.rowId) {
        await markWebhookFailed(
          supabase,
          claim.rowId,
          processingError instanceof Error ? processingError.message : 'PayPal webhook processing failed'
        );
      }
      throw processingError;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook failed' },
      { status: 400 }
    );
  }
}

async function handleOrderApproved(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource']
) {
  // Order approved - capture the payment
  try {
    const captured = await captureOrder(resource.id);
    console.log('PayPal order captured:', captured.id, captured.status);
  } catch (error) {
    console.error('Failed to capture PayPal order:', error);
  }
}

async function handleCaptureCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource']
) {
  const customMetadata = extractCustomMetadata(resource);
  if (customMetadata.type === 'drop_in_upload') {
    await handleDropInPaymentSuccess(supabase, customMetadata, resource.id);
    return;
  }

  const tipMeta = extractTipMetadata(resource);
  if (tipMeta.tipId) {
    await supabase
      .from('tips')
      .update({
        status: 'completed',
        stripe_payment_intent_id: tipMeta.reference || resource.id,
      })
      .eq('id', tipMeta.tipId);
    await supabase
      .from('transactions')
      .update({
        status: 'succeeded',
        paypal_order_id: tipMeta.reference || resource.id,
      })
      .contains('metadata', { tip_id: tipMeta.tipId });

    const { data: tipTransactions } = await supabase
      .from('transactions')
      .select('id')
      .contains('metadata', { tip_id: tipMeta.tipId });
    for (const transaction of tipTransactions || []) {
      await creditWalletFromTransaction(supabase, transaction.id);
    }
    return;
  }

  // Find the transaction by PayPal order ID
  const { data: transaction, error: findError } = await supabase
    .from('transactions')
    .select('*')
    .eq('paypal_order_id', resource.id)
    .single();

  if (findError || !transaction) {
    // Try to find by custom_id in purchase_units
    const customId = resource.purchase_units?.[0]?.custom_id;
    if (customId) {
      try {
        const parsed = JSON.parse(customId);
        const txRef = parsed.tx_ref;
        if (txRef) {
          const { data: txByRef } = await supabase
            .from('transactions')
            .select('*')
            .eq('paypal_order_id', txRef)
            .single();
          
          if (txByRef) {
            await processSuccessfulPayment(supabase, txByRef, resource);
            return;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    console.error('Transaction not found for PayPal capture:', resource.id);
    return;
  }

  await processSuccessfulPayment(supabase, transaction, resource);
}

async function processSuccessfulPayment(
  supabase: ReturnType<typeof createServiceClient>,
  transaction: {
    id: string;
    event_id: string;
    attendee_id: string | null;
    metadata: unknown;
  },
  resource: PayPalWebhookPayload['resource']
) {
  const captureId = resource.purchase_units?.[0]?.payments?.captures?.[0]?.id;

  // Update transaction status
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      paypal_capture_id: captureId,
      status: 'succeeded',
    })
    .eq('id', transaction.id);

  if (updateError) {
    console.error('Failed to update transaction:', updateError);
    return;
  }

  await creditWalletFromTransaction(supabase, transaction.id);

  // Create entitlements
  const metadata = transaction.metadata as {
    media_ids?: string[];
    unlock_all?: boolean;
  };

  const unlockAll = metadata?.unlock_all;
  const mediaIds = metadata?.media_ids || [];

  if (unlockAll) {
    await supabase.from('entitlements').insert({
      event_id: transaction.event_id,
      purchase_id: transaction.id,
      attendee_id: transaction.attendee_id,
      entitlement_type: 'bulk',
    });
  } else if (mediaIds.length > 0) {
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

async function handleCaptureFailed(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource'],
  eventType: string
) {
  const status = eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refunded' : 'failed';
  const customMetadata = extractCustomMetadata(resource);
  if (customMetadata.type === 'drop_in_upload') {
    const dropInPhotoId = readString(customMetadata.drop_in_photo_id);
    if (dropInPhotoId) {
      await supabase
        .from('drop_in_photos')
        .update({
          upload_payment_status: 'failed',
          ...(customMetadata.include_gift === true || customMetadata.include_gift === 'true'
            ? { gift_payment_status: 'failed' }
            : {}),
        })
        .eq('id', dropInPhotoId);
    }
    return;
  }

  const tipMeta = extractTipMetadata(resource);
  if (tipMeta.tipId) {
    await supabase
      .from('tips')
      .update({ status })
      .eq('id', tipMeta.tipId);
    await supabase
      .from('transactions')
      .update({ status: status === 'refunded' ? 'refunded' : 'failed' })
      .contains('metadata', { tip_id: tipMeta.tipId });
    return;
  }

  const { error } = await supabase
    .from('transactions')
    .update({ status })
    .eq('paypal_order_id', resource.id);

  if (error) {
    console.error('Failed to update transaction status:', error);
  }

  // If refunded, remove entitlements
  if (status === 'refunded') {
    const { data: transaction } = await supabase
      .from('transactions')
      .select('id')
      .eq('paypal_order_id', resource.id)
      .single();

    if (transaction) {
      await supabase.from('entitlements').delete().eq('purchase_id', transaction.id);
    }
  }
}

async function handleSubscriptionLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource'],
  eventType: string
) {
  const subscriptionId = readString(resource.id);
  if (!subscriptionId) return;

  const latest = await getBillingSubscription(subscriptionId).catch(() => null);
  const metadata = parseMetadataRecord(latest?.custom_id || resource.custom_id);
  const scope = normalizeScope(metadata.subscription_scope);

  if (!scope) {
    return;
  }

  const mappedStatus =
    mapProviderSubscriptionStatusToLocal(latest?.status || resource.status, scope) ||
    (scope === 'vault_subscription' ? 'past_due' : 'past_due');

  await syncRecurringSubscriptionRecord({
    supabase,
    provider: 'paypal',
    scope,
    status: mappedStatus,
    eventType,
    externalSubscriptionId: subscriptionId,
    externalCustomerId:
      readString(resource.subscriber?.payer_id) ||
      readString(metadata.external_customer_id) ||
      null,
    externalPlanId: readString(latest?.plan_id) || readString(resource.plan_id) || null,
    billingCycle: readString(metadata.billing_cycle) || 'monthly',
    currency: readString(metadata.pricing_currency) || 'USD',
    amountCents: readNumber(metadata.pricing_amount_cents),
    cancelAtPeriodEnd: mappedStatus === 'canceled' || mappedStatus === 'cancelled',
    canceledAt: mappedStatus === 'canceled' || mappedStatus === 'cancelled' ? new Date().toISOString() : null,
    photographerId: readString(metadata.photographer_id),
    attendeeId: readString(metadata.attendee_id),
    userId: readString(metadata.user_id),
    planCode: readString(metadata.plan_code) || 'free',
    planId: readString(metadata.plan_id),
    planSlug: readString(metadata.plan_slug),
    metadata: {
      ...metadata,
      paypal_subscription_status: latest?.status || resource.status || null,
    },
  });
}

async function handleSubscriptionPaymentFailure(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource'],
  eventType: string
) {
  const metadata = parseMetadataRecord(resource.custom_id);
  const scope = normalizeScope(metadata.subscription_scope);
  if (!scope) return;

  const subscriptionId = readString(resource.id);
  await syncRecurringSubscriptionRecord({
    supabase,
    provider: 'paypal',
    scope,
    status: 'past_due',
    eventType,
    externalSubscriptionId: subscriptionId,
    externalCustomerId:
      readString(resource.subscriber?.payer_id) ||
      readString(metadata.external_customer_id) ||
      null,
    externalPlanId: readString(resource.plan_id) || readString(metadata.provider_plan_id),
    billingCycle: readString(metadata.billing_cycle) || 'monthly',
    currency: readString(metadata.pricing_currency) || 'USD',
    amountCents: readNumber(metadata.pricing_amount_cents),
    photographerId: readString(metadata.photographer_id),
    attendeeId: readString(metadata.attendee_id),
    userId: readString(metadata.user_id),
    planCode: readString(metadata.plan_code) || 'free',
    planId: readString(metadata.plan_id),
    planSlug: readString(metadata.plan_slug),
    metadata: {
      ...metadata,
      paypal_subscription_status: resource.status || null,
    },
  });
}

async function triggerDropInProcessing(dropInPhotoId: string) {
  if (!dropInPhotoId) return;
  const processSecret = process.env.DROP_IN_PROCESS_SECRET;
  if (!processSecret) return;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const processResponse = await fetch(`${baseUrl}/api/drop-in/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-drop-in-process-secret': processSecret,
      },
      body: JSON.stringify({ dropInPhotoId }),
    });

    if (!processResponse.ok) {
      console.error('PayPal drop-in processing trigger failed:', await processResponse.text());
    }
  } catch (error) {
    console.error('Failed to trigger drop-in processing from PayPal webhook:', error);
  }
}

async function handleDropInPaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  metadata: Record<string, unknown>,
  fallbackTransactionRef: string
) {
  const attendeeId = readString(metadata.attendee_id);
  const dropInPhotoId = readString(metadata.drop_in_photo_id);
  if (!attendeeId || !dropInPhotoId) return;

  const { data: dropInPhoto } = await supabase
    .from('drop_in_photos')
    .select('id')
    .eq('id', dropInPhotoId)
    .eq('uploader_id', attendeeId)
    .eq('upload_payment_status', 'pending')
    .maybeSingle();

  if (!dropInPhoto) return;

  const transactionRef =
    readString(metadata.tx_ref) ||
    readString(metadata.order_id) ||
    fallbackTransactionRef;
  const includeGift = metadata.include_gift === true || metadata.include_gift === 'true';

  await supabase
    .from('drop_in_photos')
    .update({
      upload_payment_status: 'paid',
      upload_payment_transaction_id: transactionRef,
      ...(includeGift
        ? {
            gift_payment_status: 'paid',
            gift_payment_transaction_id: transactionRef,
          }
        : {}),
    })
    .eq('id', dropInPhotoId);

  await triggerDropInProcessing(dropInPhotoId);
}

function normalizeScope(value: unknown): SubscriptionScope | null {
  if (value === 'creator_subscription') return 'creator_subscription';
  if (value === 'attendee_subscription') return 'attendee_subscription';
  if (value === 'vault_subscription') return 'vault_subscription';
  return null;
}

function extractTipMetadata(resource: PayPalWebhookPayload['resource']) {
  const parsed = extractCustomMetadata(resource);
  const tipId = readString(parsed.tip_id);
  const reference = readString(parsed.tx_ref) || readString(parsed.order_id);
  return { tipId, reference };
}

function extractCustomMetadata(resource: PayPalWebhookPayload['resource']) {
  const customId = resource.purchase_units?.[0]?.custom_id || resource.custom_id;
  if (!customId) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(customId) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

