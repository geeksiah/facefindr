export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  verifyPaystackWebhookSignatureAsync,
} from '@/lib/payments/paystack';
import { incrementDropInCredits } from '@/lib/drop-in/credits';
import { emitFinancialInAppNotification } from '@/lib/payments/financial-notifications';
import {
  recordDropInCreditPurchaseJournal,
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

interface PaystackWebhookPayload {
  event: string;
  data: {
    id?: number;
    reference?: string;
    status?: string;
    fees?: number;
    amount?: number;
    currency?: string;
    customer?: {
      customer_code?: string;
      email?: string;
    };
    plan?: {
      plan_code?: string;
      interval?: string;
      amount?: number;
      name?: string;
    };
    subscription_code?: string;
    created_at?: string;
    next_payment_date?: string;
    metadata?: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('x-paystack-signature') || '';

    if (!(await verifyPaystackWebhookSignatureAsync(body, signature))) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(body) as PaystackWebhookPayload;
    const supabase = createServiceClient();
    const providerEventId = String(payload.data?.id || payload.data?.reference || Date.now());
    const claim = await claimWebhookEvent({
      supabase,
      provider: 'paystack',
      eventId: providerEventId,
      eventType: payload.event,
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
      switch (payload.event) {
        case 'charge.success': {
          await handleChargeSuccess(supabase, payload);
          break;
        }
        case 'charge.failed': {
          await handleChargeFailure(supabase, payload);
          break;
        }
        case 'subscription.create':
        case 'subscription.disable':
        case 'subscription.not_renew':
        case 'invoice.payment_failed':
        case 'invoice.update': {
          await handleSubscriptionEvent(supabase, payload);
          break;
        }
        default:
          console.log(`Unhandled Paystack event: ${payload.event}`);
      }

      if (claim.rowId) {
        await markWebhookProcessed(supabase, claim.rowId);
      }
    } catch (processingError) {
      if (claim.rowId) {
        await markWebhookFailed(
          supabase,
          claim.rowId,
          processingError instanceof Error ? processingError.message : 'Paystack webhook processing failed'
        );
      }
      throw processingError;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook failed' },
      { status: 400 }
    );
  }
}

async function handleChargeSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  payload: PaystackWebhookPayload
) {
  const reference = payload.data?.reference;
  if (!reference) return;

  const metadata = (payload.data?.metadata || {}) as Record<string, unknown>;
  if (metadata.type === 'drop_in_upload') {
    await handleDropInPaymentSuccess(supabase, payload, metadata);
    return;
  }
  if (metadata.type === 'drop_in_credit_purchase') {
    await handleDropInCreditPurchaseSuccess(supabase, payload, metadata);
    return;
  }
  if (metadata.tip_id) {
    const tipId = String(metadata.tip_id);
    await supabase
      .from('tips')
      .update({
        status: 'completed',
        stripe_payment_intent_id: reference,
      })
      .eq('id', tipId);
    await (supabase.from('transactions') as any)
      .update({
        status: 'succeeded',
        paystack_reference: reference,
        paystack_transaction_id: payload.data?.id ? String(payload.data.id) : null,
      })
      .contains('metadata', { tip_id: tipId });

    const { data: tipTransactions } = await (supabase
      .from('transactions') as any)
      .select('id')
      .contains('metadata', { tip_id: tipId });
    for (const transaction of tipTransactions || []) {
      await creditWalletFromTransaction(supabase, transaction.id);
      await recordSettlementJournalForTransaction(supabase, {
        transactionId: transaction.id,
        flowType: 'tip',
        sourceKind: 'tip',
        sourceId: tipId,
        description: 'Tip settled via Paystack webhook',
        metadata: {
          provider_event: payload.event,
          paystack_reference: reference,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record paystack tip settlement journal:', ledgerError);
      });
    }
    return;
  }
  if (metadata.subscription_scope) {
    await syncRecurringFromPaystackPayload(supabase, payload.event, payload.data, metadata, 'active');
    const scope = normalizeScope(metadata.subscription_scope);
    const subscriptionChargeRef = readString(payload.data.reference) || (payload.data.id ? String(payload.data.id) : null);
    const amountMinor =
      readNumber(metadata.pricing_amount_cents) ??
      (readNumber(payload.data.amount) !== null ? Math.round(Number(payload.data.amount)) : 0) ??
      0;
    const currency = readString(payload.data.currency) || readString(metadata.pricing_currency) || 'USD';
    const targetUserId =
      readString(metadata.photographer_id) ||
      readString(metadata.attendee_id) ||
      readString(metadata.user_id);

    if (scope && subscriptionChargeRef && amountMinor > 0) {
      await recordSubscriptionChargeJournal(supabase, {
        sourceKind: scope,
        sourceId: `${subscriptionChargeRef}:${scope}`,
        amountMinor,
        currency,
        provider: 'paystack',
        scope,
        actorId: scope === 'creator_subscription' ? readString(metadata.photographer_id) : null,
        metadata: {
          external_subscription_id:
            readString(payload.data.subscription_code) || readString(metadata.subscription_id) || null,
          paystack_reference: payload.data.reference || null,
          paystack_event: payload.event,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record paystack subscription charge journal:', ledgerError);
      });
    }

    if (targetUserId) {
      await emitFinancialInAppNotification(supabase, {
        userId: targetUserId,
        templateCode: 'subscription_renewed',
        subject: 'Subscription renewed',
        body: `Subscription payment received: ${String(currency).toUpperCase()} ${(Math.max(0, amountMinor) / 100).toFixed(2)}.`,
        dedupeKey: `subscription_renewed:paystack:${scope || 'unknown'}:${subscriptionChargeRef || 'none'}`,
        metadata: {
          scope: scope || null,
          paystack_event: payload.event,
          paystack_reference: payload.data.reference || null,
          amount_minor: amountMinor,
          currency: String(currency).toUpperCase(),
        },
      }).catch(() => {
        // Best effort notification.
      });
    }
    return;
  }

  const { data: transaction, error: findError } = await (supabase
    .from('transactions') as any)
    .select('*')
    .eq('paystack_reference', reference)
    .single();

  if (findError || !transaction) {
    console.error('Paystack transaction not found:', reference);
    return;
  }

  const providerFee = Number.isFinite(payload.data?.fees)
    ? Math.round(Number(payload.data.fees))
    : null;

  const { error: updateError } = await (supabase
    .from('transactions') as any)
    .update({
      paystack_transaction_id: payload.data?.id ? String(payload.data.id) : null,
      status: 'succeeded',
      ...(providerFee !== null ? { provider_fee: providerFee, stripe_fee: providerFee } : {}),
    })
    .eq('id', transaction.id);

  if (updateError) {
    console.error('Failed to update paystack transaction:', updateError);
    return;
  }

  await createEntitlements(supabase, transaction);
}

async function handleChargeFailure(
  supabase: ReturnType<typeof createServiceClient>,
  payload: PaystackWebhookPayload
) {
  const reference = payload.data?.reference;
  if (!reference) return;

  const metadata = (payload.data?.metadata || {}) as Record<string, unknown>;
  if (metadata.type === 'drop_in_upload') {
    const dropInPhotoId = String(metadata.drop_in_photo_id || '');
    if (dropInPhotoId) {
      await supabase
        .from('drop_in_photos')
        .update({
          upload_payment_status: 'failed',
          gift_payment_status: 'failed',
        })
        .eq('id', dropInPhotoId);
    }
    return;
  }
  if (metadata.type === 'drop_in_credit_purchase') {
    const purchaseId = String(metadata.purchase_id || '');
    if (purchaseId) {
      await supabase
        .from('drop_in_credit_purchases')
        .update({ status: 'failed' })
        .eq('id', purchaseId)
        .eq('status', 'pending');
    }
    return;
  }
  if (metadata.tip_id) {
    const tipId = String(metadata.tip_id);
    await supabase
      .from('tips')
      .update({ status: 'failed' })
      .eq('id', tipId);
    await (supabase.from('transactions') as any)
      .update({ status: 'failed' })
      .contains('metadata', { tip_id: tipId });
    return;
  }
  if (metadata.subscription_scope) {
    await syncRecurringFromPaystackPayload(supabase, payload.event, payload.data, metadata, 'past_due');
    const scope = normalizeScope(metadata.subscription_scope);
    const targetUserId =
      readString(metadata.photographer_id) ||
      readString(metadata.attendee_id) ||
      readString(metadata.user_id);
    const amountMinor =
      readNumber(metadata.pricing_amount_cents) ??
      (readNumber(payload.data.amount) !== null ? Math.round(Number(payload.data.amount)) : 0) ??
      0;
    const currency = readString(payload.data.currency) || readString(metadata.pricing_currency) || 'USD';

    if (targetUserId) {
      await emitFinancialInAppNotification(supabase, {
        userId: targetUserId,
        templateCode: 'subscription_failed',
        subject: 'Subscription payment failed',
        body: `We could not process your subscription payment of ${String(currency).toUpperCase()} ${(Math.max(0, amountMinor) / 100).toFixed(2)}.`,
        dedupeKey: `subscription_failed:paystack:${scope || 'unknown'}:${payload.data.reference || payload.data.id || 'none'}`,
        metadata: {
          scope: scope || null,
          paystack_event: payload.event,
          paystack_reference: payload.data.reference || null,
          amount_minor: amountMinor,
          currency: String(currency).toUpperCase(),
        },
      }).catch(() => {
        // Best effort notification.
      });
    }
    return;
  }

  const { error } = await (supabase
    .from('transactions') as any)
    .update({ status: 'failed' })
    .eq('paystack_reference', reference);

  if (error) {
    console.error('Failed to mark paystack transaction failed:', error);
  }
}

async function handleSubscriptionEvent(
  supabase: ReturnType<typeof createServiceClient>,
  payload: PaystackWebhookPayload
) {
  const metadata = parseMetadataRecord(payload.data?.metadata);
  await syncRecurringFromPaystackPayload(supabase, payload.event, payload.data, metadata);
}

async function syncRecurringFromPaystackPayload(
  supabase: ReturnType<typeof createServiceClient>,
  eventType: string,
  data: PaystackWebhookPayload['data'],
  rawMetadata: Record<string, unknown>,
  statusOverride?: string
) {
  const metadata = parseMetadataRecord(rawMetadata);
  const scope = normalizeScope(metadata.subscription_scope);
  if (!scope) return;
  const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
  const manualRenewalMode =
    renewalMode === 'manual_renewal' || metadata.manual_renewal === true;

  const providerStatus = statusOverride || readString(data.status) || eventType;
  const mappedStatus = mapProviderSubscriptionStatusToLocal(providerStatus, scope) || 'past_due';
  const derivedAmountCents =
    readNumber(metadata.pricing_amount_cents) ??
    (readNumber(data.amount) !== null ? Math.round(Number(data.amount)) : null);
  const isCancelled = mappedStatus === 'canceled' || mappedStatus === 'cancelled';
  const externalSubscriptionId =
    manualRenewalMode
      ? null
      : readString(data.subscription_code) ||
        readString(metadata.subscription_id) ||
        readString(metadata.external_subscription_id) ||
        readString(data.reference) ||
        (data.id ? String(data.id) : null);
  const cancelAtPeriodEnd =
    manualRenewalMode ||
    isCancelled ||
    readString(metadata.cancel_at_period_end) === 'true' ||
    metadata.cancel_at_period_end === true;
  const autoRenewPreference =
    manualRenewalMode
      ? false
      : !cancelAtPeriodEnd;

  await syncRecurringSubscriptionRecord({
    supabase,
    provider: 'paystack',
    scope,
    status: mappedStatus,
    eventType,
    externalSubscriptionId,
    externalCustomerId:
      readString(data.customer?.customer_code) ||
      readString(metadata.external_customer_id) ||
      readString(data.customer?.email),
    externalPlanId:
      readString(data.plan?.plan_code) ||
      readString(metadata.provider_plan_id) ||
      readString(metadata.external_plan_id),
    billingCycle:
      readString(metadata.billing_cycle) ||
      readString(data.plan?.interval) ||
      'monthly',
    currency: readString(data.currency) || readString(metadata.pricing_currency) || 'USD',
    amountCents: derivedAmountCents,
    currentPeriodStart: readString(data.created_at),
    currentPeriodEnd: readString(data.next_payment_date) || readString(metadata.current_period_end),
    cancelAtPeriodEnd,
    canceledAt: isCancelled ? new Date().toISOString() : null,
    photographerId: readString(metadata.photographer_id),
    attendeeId: readString(metadata.attendee_id),
    userId: readString(metadata.user_id),
    planCode: readString(metadata.plan_code) || 'free',
    planId: readString(metadata.plan_id),
    planSlug: readString(metadata.plan_slug) || readString(data.plan?.name),
    metadata: {
      ...metadata,
      renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
      auto_renew_preference: autoRenewPreference,
      cancel_at_period_end: cancelAtPeriodEnd,
      paystack_reference: data.reference || null,
    },
  });
}

function normalizeScope(value: unknown): SubscriptionScope | null {
  if (value === 'creator_subscription') return 'creator_subscription';
  if (value === 'attendee_subscription') return 'attendee_subscription';
  if (value === 'vault_subscription') return 'vault_subscription';
  return null;
}

async function handleDropInPaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  payload: PaystackWebhookPayload,
  metadata: Record<string, unknown>
) {
  const attendeeId = String(metadata.attendee_id || '');
  const dropInPhotoId = String(metadata.drop_in_photo_id || '');
  const includeGift = metadata.include_gift === true || metadata.include_gift === 'true';

  if (!attendeeId || !dropInPhotoId) return;

  const { data: dropInPhoto } = await supabase
    .from('drop_in_photos')
    .select('*')
    .eq('id', dropInPhotoId)
    .eq('uploader_id', attendeeId)
    .eq('upload_payment_status', 'pending')
    .single();

  if (!dropInPhoto) return;

  const transactionRef = payload.data?.reference || String(payload.data?.id || '');
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
      console.error('Paystack drop-in processing trigger failed:', await processResponse.text());
    }
  } catch (error) {
    console.error('Failed to trigger drop-in processing from Paystack webhook:', error);
  }
}

async function handleDropInCreditPurchaseSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  payload: PaystackWebhookPayload,
  metadata: Record<string, unknown>
) {
  const purchaseId = String(metadata.purchase_id || '');
  if (!purchaseId) return;

  const { data: purchase } = await supabase
    .from('drop_in_credit_purchases')
    .select('id, attendee_id, credits_purchased, status')
    .eq('id', purchaseId)
    .maybeSingle();

  if (!purchase || purchase.status !== 'pending') return;

  const transactionRef = payload.data?.reference || String(payload.data?.id || '');
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

  await incrementDropInCredits(
    supabase,
    purchase.attendee_id,
    Number(purchase.credits_purchased || 0)
  );

  const amountMinor =
    readNumber(metadata.amount_paid_cents) ??
    (readNumber(payload.data.amount) !== null ? Math.round(Number(payload.data.amount)) : null) ??
    0;

  if (amountMinor > 0) {
    await recordDropInCreditPurchaseJournal(supabase, {
      purchaseId: purchase.id,
      attendeeId: purchase.attendee_id,
      amountMinor,
      currency: String(payload.data.currency || 'USD').toUpperCase(),
      provider: 'paystack',
      metadata: {
        paystack_reference: payload.data.reference || null,
        paystack_transaction_id: payload.data.id ? String(payload.data.id) : null,
      },
    }).catch((ledgerError) => {
      console.error('[LEDGER] failed to record paystack drop-in credit purchase journal:', ledgerError);
    });
  }
}

async function createEntitlements(
  supabase: ReturnType<typeof createServiceClient>,
  transaction: {
    id: string;
    event_id: string;
    attendee_id: string | null;
    metadata: unknown;
  }
) {
  await creditWalletFromTransaction(supabase, transaction.id);

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
    return;
  }

  if (mediaIds.length > 0) {
    const entitlements = mediaIds.map((mediaId) => ({
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
    description: 'Photo purchase settled via Paystack webhook',
    metadata: {
      provider_event: 'charge.success',
    },
  }).catch((ledgerError) => {
    console.error('[LEDGER] failed to record paystack photo purchase settlement journal:', ledgerError);
  });
}
