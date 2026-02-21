export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyWebhook, captureOrder, getBillingSubscription } from '@/lib/payments/paypal';
import { emitFinancialInAppNotification } from '@/lib/payments/financial-notifications';
import {
  recordDropInCreditPurchaseJournal,
  recordRefundJournalForTransaction,
  recordSettlementJournalForTransaction,
  recordSubscriptionChargeJournal,
} from '@/lib/payments/financial-flow-ledger';
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
        case 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED': {
          await handleSubscriptionPaymentCompleted(supabase, payload.resource, payload.event_type);
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
  if (customMetadata.type === 'drop_in_credit_purchase') {
    await handleDropInCreditPurchaseSuccess(supabase, customMetadata, resource.id);
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
      await recordSettlementJournalForTransaction(supabase, {
        transactionId: transaction.id,
        flowType: 'tip',
        sourceKind: 'tip',
        sourceId: tipMeta.tipId,
        description: 'Tip settled via PayPal webhook',
        metadata: {
          provider_event: 'PAYMENT.CAPTURE.COMPLETED',
          paypal_reference: tipMeta.reference || resource.id,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record paypal tip settlement journal:', ledgerError);
      });
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

  await recordSettlementJournalForTransaction(supabase, {
    transactionId: transaction.id,
    flowType: 'photo_purchase',
    sourceKind: 'transaction',
    sourceId: transaction.id,
    description: 'Photo purchase settled via PayPal webhook',
    metadata: {
      provider_event: 'PAYMENT.CAPTURE.COMPLETED',
      paypal_order_id: resource.id,
    },
  }).catch((ledgerError) => {
    console.error('[LEDGER] failed to record paypal photo purchase settlement journal:', ledgerError);
  });
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
  if (customMetadata.type === 'drop_in_credit_purchase') {
    const purchaseId = readString(customMetadata.purchase_id);
    if (purchaseId) {
      await supabase
        .from('drop_in_credit_purchases')
        .update({ status: 'failed' })
        .eq('id', purchaseId)
        .eq('status', 'pending');
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
    if (status === 'refunded') {
      const { data: tipTransactions } = await supabase
        .from('transactions')
        .select('id')
        .contains('metadata', { tip_id: tipMeta.tipId });
      for (const transaction of tipTransactions || []) {
        await recordRefundJournalForTransaction(supabase, {
          transactionId: transaction.id,
          sourceKind: 'tip',
          sourceId: tipMeta.tipId,
          description: 'Tip refund processed via PayPal webhook',
          metadata: {
            provider_event: eventType,
            paypal_reference: tipMeta.reference || resource.id,
          },
        }).catch((ledgerError) => {
          console.error('[LEDGER] failed to record paypal tip refund journal:', ledgerError);
        });
      }
    }
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
      .select('id, wallet_id, gross_amount, currency')
      .eq('paypal_order_id', resource.id)
      .single();

    if (transaction) {
      await supabase.from('entitlements').delete().eq('purchase_id', transaction.id);
      await recordRefundJournalForTransaction(supabase, {
        transactionId: transaction.id,
        sourceKind: 'transaction',
        sourceId: transaction.id,
        description: 'Photo purchase refund processed via PayPal webhook',
        metadata: {
          provider_event: eventType,
          paypal_order_id: resource.id,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record paypal refund journal:', ledgerError);
      });

      const creatorId = transaction.wallet_id
        ? (
            await supabase
              .from('wallets')
              .select('photographer_id')
              .eq('id', transaction.wallet_id)
              .maybeSingle()
          ).data?.photographer_id
        : null;

      if (creatorId) {
        await emitFinancialInAppNotification(supabase, {
          userId: creatorId,
          templateCode: 'refund_processed',
          subject: 'Refund processed',
          body: `A refund of ${String(transaction.currency || 'USD').toUpperCase()} ${(Number(transaction.gross_amount || 0) / 100).toFixed(2)} was processed.`,
          dedupeKey: `refund_processed:paypal:${transaction.id}:${resource.id}`,
          metadata: {
            transaction_id: transaction.id,
            paypal_order_id: resource.id,
          },
        }).catch(() => {
          // Best effort notification.
        });
      }
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

  const targetUserId =
    readString(metadata.photographer_id) ||
    readString(metadata.attendee_id) ||
    readString(metadata.user_id);
  if (targetUserId) {
    await emitFinancialInAppNotification(supabase, {
      userId: targetUserId,
      templateCode: 'subscription_failed',
      subject: 'Subscription payment failed',
      body: `We could not process your subscription payment of ${String(readString(metadata.pricing_currency) || 'USD').toUpperCase()} ${(Math.max(0, Number(readNumber(metadata.pricing_amount_cents) || 0)) / 100).toFixed(2)}.`,
      dedupeKey: `subscription_failed:paypal:${scope}:${subscriptionId || 'none'}:${eventType}`,
      metadata: {
        scope,
        subscription_id: subscriptionId || null,
        amount_minor: Number(readNumber(metadata.pricing_amount_cents) || 0),
        currency: String(readString(metadata.pricing_currency) || 'USD').toUpperCase(),
      },
    }).catch(() => {
      // Best effort notification.
    });
  }
}

async function handleSubscriptionPaymentCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource'],
  eventType: string
) {
  const subscriptionId =
    readString((resource as any).billing_agreement_id) ||
    readString((resource as any).subscription_id) ||
    readString(resource.id);
  if (!subscriptionId) return;

  const latest = await getBillingSubscription(subscriptionId).catch(() => null);
  const metadata = parseMetadataRecord(latest?.custom_id || resource.custom_id);
  const scope = normalizeScope(metadata.subscription_scope);
  if (!scope) return;

  const amountValue = Number(
    readString((resource as any).amount?.value) ||
      readString((resource as any).billing_info?.last_payment?.amount?.value) ||
      0
  );
  const amountMinor =
    readNumber(metadata.pricing_amount_cents) ??
    (Number.isFinite(amountValue) ? Math.max(0, Math.round(amountValue * 100)) : 0);
  const currency =
    readString((resource as any).amount?.currency_code) ||
    readString((resource as any).billing_info?.last_payment?.amount?.currency_code) ||
    readString(metadata.pricing_currency) ||
    'USD';
  const sourceId =
    readString((resource as any).id) ||
    readString((resource as any).transaction_id) ||
    subscriptionId;

  await syncRecurringSubscriptionRecord({
    supabase,
    provider: 'paypal',
    scope,
    status: 'active',
    eventType,
    externalSubscriptionId: subscriptionId,
    externalCustomerId:
      readString(resource.subscriber?.payer_id) ||
      readString(metadata.external_customer_id) ||
      null,
    externalPlanId: readString((resource as any).plan_id) || readString(metadata.provider_plan_id),
    billingCycle: readString(metadata.billing_cycle) || 'monthly',
    currency,
    amountCents: amountMinor,
    photographerId: readString(metadata.photographer_id),
    attendeeId: readString(metadata.attendee_id),
    userId: readString(metadata.user_id),
    planCode: readString(metadata.plan_code) || 'free',
    planId: readString(metadata.plan_id),
    planSlug: readString(metadata.plan_slug),
    metadata: {
      ...metadata,
      paypal_subscription_status: readString(resource.status) || null,
    },
  });

  if (amountMinor > 0) {
    await recordSubscriptionChargeJournal(supabase, {
      sourceKind: scope,
      sourceId: `${sourceId}:${scope}`,
      amountMinor,
      currency,
      provider: 'paypal',
      scope,
      actorId: scope === 'creator_subscription' ? readString(metadata.photographer_id) : null,
      metadata: {
        subscription_id: subscriptionId,
        paypal_resource_id: readString((resource as any).id) || null,
      },
    }).catch((ledgerError) => {
      console.error('[LEDGER] failed to record paypal subscription charge journal:', ledgerError);
    });
  }

  const targetUserId =
    readString(metadata.photographer_id) ||
    readString(metadata.attendee_id) ||
    readString(metadata.user_id);
  if (targetUserId) {
    await emitFinancialInAppNotification(supabase, {
      userId: targetUserId,
      templateCode: 'subscription_renewed',
      subject: 'Subscription renewed',
      body: `Subscription payment received: ${String(currency).toUpperCase()} ${(Math.max(0, amountMinor) / 100).toFixed(2)}.`,
      dedupeKey: `subscription_renewed:paypal:${scope}:${sourceId}`,
      metadata: {
        scope,
        subscription_id: subscriptionId,
        amount_minor: amountMinor,
        currency: String(currency).toUpperCase(),
      },
    }).catch(() => {
      // Best effort notification.
    });
  }
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

async function handleDropInCreditPurchaseSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  metadata: Record<string, unknown>,
  fallbackTransactionRef: string
) {
  const purchaseId = readString(metadata.purchase_id);
  if (!purchaseId) return;

  const { data: purchase } = await supabase
    .from('drop_in_credit_purchases')
    .select('id, attendee_id, credits_purchased, status')
    .eq('id', purchaseId)
    .maybeSingle();

  if (!purchase || purchase.status !== 'pending') return;

  const transactionRef = readString(metadata.tx_ref) || readString(metadata.order_id) || fallbackTransactionRef;

  const { data: activated } = await supabase
    .from('drop_in_credit_purchases')
    .update({
      status: 'active',
      credits_remaining: purchase.credits_purchased,
      payment_intent_id: transactionRef || null,
    })
    .eq('id', purchase.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!activated?.id) return;

  const { data: attendee } = await supabase
    .from('attendees')
    .select('drop_in_credits')
    .eq('id', purchase.attendee_id)
    .maybeSingle();
  const currentCredits = Number(attendee?.drop_in_credits || 0);

  await supabase
    .from('attendees')
    .update({ drop_in_credits: currentCredits + Number(purchase.credits_purchased || 0) })
    .eq('id', purchase.attendee_id);

  const amountMinor = Number(readNumber(metadata.amount_paid_cents) || 0);
  if (amountMinor > 0) {
    await recordDropInCreditPurchaseJournal(supabase, {
      purchaseId: purchase.id,
      attendeeId: purchase.attendee_id,
      amountMinor: Math.max(0, Math.round(amountMinor)),
      currency: String(readString(metadata.currency) || 'USD').toUpperCase(),
      provider: 'paypal',
      metadata: {
        paypal_reference: transactionRef || null,
      },
    }).catch((ledgerError) => {
      console.error('[LEDGER] failed to record paypal drop-in credit purchase journal:', ledgerError);
    });
  }
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

