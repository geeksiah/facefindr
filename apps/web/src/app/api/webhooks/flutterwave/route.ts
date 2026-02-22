export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { incrementDropInCredits } from '@/lib/drop-in/credits';
import { verifyWebhookSignature, verifyTransaction } from '@/lib/payments/flutterwave';
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
import { restoreMediaRecoveryRequestsFromTransaction } from '@/lib/media/recovery-service';
import { creditWalletFromTransaction } from '@/lib/payments/wallet-balance';
import { createServiceClient } from '@/lib/supabase/server';

const FLUTTERWAVE_WEBHOOK_SECRET = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

interface FlutterwaveWebhookPayload {
  event: string;
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    charged_amount: number;
    app_fee: number;
    merchant_fee: number;
    status: 'successful' | 'failed' | 'pending';
    payment_type: string;
    subscription_id?: string | number;
    plan?: string;
    payment_plan?: string;
    charged_at?: string;
    customer: {
      id: number;
      name: string;
      phone_number: string;
      email: string;
    };
    meta?: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  if (!FLUTTERWAVE_WEBHOOK_SECRET) {
    console.error('FLUTTERWAVE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('verif-hash');

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(signature, FLUTTERWAVE_WEBHOOK_SECRET)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const payload: FlutterwaveWebhookPayload = JSON.parse(body);
    const supabase = createServiceClient();
    const providerEventId = `${payload.event}:${payload.data?.id || payload.data?.tx_ref || 'unknown'}`;
    const claim = await claimWebhookEvent({
      supabase,
      provider: 'flutterwave',
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
      // Handle different event types
      switch (payload.event) {
        case 'charge.completed': {
          await handleChargeCompleted(supabase, payload.data);
          break;
        }

        case 'transfer.completed': {
          await handleTransferCompleted(supabase, payload.data);
          break;
        }

        case 'charge.failed': {
          await handleChargeFailed(supabase, payload.data);
          break;
        }

        default:
          if (payload.event.startsWith('subscription.')) {
            await handleSubscriptionLifecycle(supabase, payload.event, payload.data);
          } else {
            console.log(`Unhandled Flutterwave event: ${payload.event}`);
          }
      }

      if (claim.rowId) {
        await markWebhookProcessed(supabase, claim.rowId);
      }
    } catch (processingError) {
      if (claim.rowId) {
        await markWebhookFailed(
          supabase,
          claim.rowId,
          processingError instanceof Error ? processingError.message : 'Flutterwave webhook processing failed'
        );
      }
      throw processingError;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Flutterwave webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook failed' },
      { status: 400 }
    );
  }
}

async function handleChargeCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  data: FlutterwaveWebhookPayload['data']
) {
  // Verify the transaction with Flutterwave
  const verifiedTx = await verifyTransaction(String(data.id));

  if (verifiedTx.status !== 'successful') {
    console.log(`Transaction ${data.tx_ref} not successful: ${verifiedTx.status}`);
    return;
  }

  const verifiedMeta = (verifiedTx.meta as Record<string, unknown>) || data.meta || {};

  if (verifiedMeta.type === 'drop_in_upload') {
    await handleDropInPaymentSuccess(supabase, {
      dropInPhotoId: readString(verifiedMeta.drop_in_photo_id),
      attendeeId: readString(verifiedMeta.attendee_id),
      includeGift: verifiedMeta.include_gift === true || verifiedMeta.include_gift === 'true',
      transactionRef: data.tx_ref || String(data.id),
    });
    return;
  }
  if (verifiedMeta.type === 'drop_in_credit_purchase') {
    await handleDropInCreditPurchaseSuccess(supabase, {
      purchaseId: readString(verifiedMeta.purchase_id),
      attendeeId: readString(verifiedMeta.attendee_id),
      transactionRef: data.tx_ref || String(data.id),
      currency: verifiedTx.currency || data.currency,
      amountMinor:
        readNumber((verifiedMeta as Record<string, unknown>).amount_paid_cents) ??
        (readNumber(verifiedTx.charged_amount) !== null
          ? Math.round(Number(verifiedTx.charged_amount) * 100)
          : readNumber(data.charged_amount) !== null
            ? Math.round(Number(data.charged_amount) * 100)
            : 0),
    });
    return;
  }

  await syncRecurringFromFlutterwaveData(supabase, 'charge.completed', {
    ...data,
    status: verifiedTx.status,
    currency: verifiedTx.currency || data.currency,
    charged_amount: verifiedTx.charged_amount || data.charged_amount,
    amount: verifiedTx.amount || data.amount,
    meta: verifiedMeta,
    subscription_id:
      (verifiedTx.meta as Record<string, unknown> | undefined)?.subscription_id as string | number | undefined,
  });
  const recurringMeta = parseMetadataRecord(verifiedMeta);
  const recurringScope = normalizeScope(recurringMeta.subscription_scope);
  const recurringAmountMinor =
    readNumber(recurringMeta.pricing_amount_cents) ??
    (readNumber(verifiedTx.charged_amount) !== null
      ? Math.round(Number(verifiedTx.charged_amount) * 100)
      : readNumber(data.charged_amount) !== null
        ? Math.round(Number(data.charged_amount) * 100)
        : 0) ??
    0;
  const recurringCurrency =
    readString(verifiedTx.currency) || readString(data.currency) || readString(recurringMeta.pricing_currency) || 'USD';
  const recurringSourceId = readString(data.tx_ref) || String(data.id);
  const recurringUserId =
    readString(recurringMeta.photographer_id) ||
    readString(recurringMeta.attendee_id) ||
    readString(recurringMeta.user_id);

  if (recurringScope && recurringAmountMinor > 0) {
    await recordSubscriptionChargeJournal(supabase, {
      sourceKind: recurringScope,
      sourceId: `${recurringSourceId}:${recurringScope}`,
      amountMinor: recurringAmountMinor,
      currency: recurringCurrency,
      provider: 'flutterwave',
      scope: recurringScope,
      actorId: recurringScope === 'creator_subscription' ? readString(recurringMeta.photographer_id) : null,
      metadata: {
        flutterwave_tx_ref: data.tx_ref,
        flutterwave_tx_id: String(data.id),
        external_subscription_id:
          readString(recurringMeta.subscription_id) ||
          readString(recurringMeta.provider_subscription_id) ||
          readString(data.subscription_id),
      },
    }).catch((ledgerError) => {
      console.error('[LEDGER] failed to record flutterwave subscription charge journal:', ledgerError);
    });
  }

  if (recurringScope && recurringUserId) {
    await emitFinancialInAppNotification(supabase, {
      userId: recurringUserId,
      templateCode: 'subscription_renewed',
      subject: 'Subscription renewed',
      body: `Subscription payment received: ${String(recurringCurrency).toUpperCase()} ${(Math.max(0, recurringAmountMinor) / 100).toFixed(2)}.`,
      dedupeKey: `subscription_renewed:flutterwave:${recurringScope}:${recurringSourceId}`,
      metadata: {
        scope: recurringScope,
        flutterwave_tx_ref: data.tx_ref,
        flutterwave_tx_id: String(data.id),
        amount_minor: recurringAmountMinor,
        currency: String(recurringCurrency).toUpperCase(),
      },
    }).catch(() => {
      // Best effort notification.
    });
  }

  const tipId = readString((data.meta || {}).tip_id);
  if (tipId) {
    await supabase
      .from('tips')
      .update({
        status: 'completed',
        stripe_payment_intent_id: data.tx_ref,
      })
      .eq('id', tipId);
    await supabase
      .from('transactions')
      .update({
        status: 'succeeded',
        flutterwave_tx_ref: data.tx_ref,
        flutterwave_tx_id: String(data.id),
      })
      .contains('metadata', { tip_id: tipId });

    const { data: tipTransactions } = await supabase
      .from('transactions')
      .select('id')
      .contains('metadata', { tip_id: tipId });
    for (const transaction of tipTransactions || []) {
      await creditWalletFromTransaction(supabase, transaction.id);
      await recordSettlementJournalForTransaction(supabase, {
        transactionId: transaction.id,
        flowType: 'tip',
        sourceKind: 'tip',
        sourceId: tipId,
        description: 'Tip settled via Flutterwave webhook',
        metadata: {
          provider_event: 'charge.completed',
          flutterwave_tx_ref: data.tx_ref,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record flutterwave tip settlement journal:', ledgerError);
      });
    }
    return;
  }

  // Find the pending transaction
  const { data: transaction, error: findError } = await supabase
    .from('transactions')
    .select('*')
    .eq('flutterwave_tx_ref', data.tx_ref)
    .single();

  if (findError || !transaction) {
    console.error('Transaction not found:', data.tx_ref);
    return;
  }

  // Update transaction status
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      flutterwave_tx_id: String(data.id),
      status: 'succeeded',
      provider_fee: Math.round(data.app_fee * 100), // Convert to cents
    })
    .eq('id', transaction.id);

  if (updateError) {
    console.error('Failed to update transaction:', updateError);
    return;
  }

  await restoreMediaRecoveryRequestsFromTransaction(
    {
      ...(transaction as any),
      flutterwave_tx_ref: data.tx_ref,
      payment_provider: (transaction as any).payment_provider || 'flutterwave',
    },
    { provider: 'flutterwave', supabase }
  ).catch((restoreError) => {
    console.error('[flutterwave webhook] recovery fulfillment failed:', restoreError);
  });

  // Create entitlements
  await createEntitlements(supabase, transaction);
}

async function handleChargeFailed(
  supabase: ReturnType<typeof createServiceClient>,
  data: FlutterwaveWebhookPayload['data']
) {
  const metadata = parseMetadataRecord(data.meta);
  if (metadata.type === 'drop_in_upload') {
    const dropInPhotoId = readString(metadata.drop_in_photo_id);
    if (dropInPhotoId) {
      await supabase
        .from('drop_in_photos')
        .update({
          upload_payment_status: 'failed',
          ...(metadata.include_gift === true || metadata.include_gift === 'true'
            ? { gift_payment_status: 'failed' }
            : {}),
        })
        .eq('id', dropInPhotoId);
    }
    return;
  }
  if (metadata.type === 'drop_in_credit_purchase') {
    const purchaseId = readString(metadata.purchase_id);
    if (purchaseId) {
      await supabase
        .from('drop_in_credit_purchases')
        .update({ status: 'failed' })
        .eq('id', purchaseId)
        .eq('status', 'pending');
    }
    return;
  }

  const tipId = readString((data.meta || {}).tip_id);
  if (tipId) {
    await supabase
      .from('tips')
      .update({ status: 'failed' })
      .eq('id', tipId);
    await supabase
      .from('transactions')
      .update({ status: 'failed' })
      .contains('metadata', { tip_id: tipId });
    await syncRecurringFromFlutterwaveData(supabase, 'charge.failed', data, 'past_due');
    return;
  }

  await supabase
    .from('transactions')
    .update({ status: 'failed' })
    .eq('flutterwave_tx_ref', data.tx_ref);

  await syncRecurringFromFlutterwaveData(supabase, 'charge.failed', data, 'past_due');

  const scope = normalizeScope(metadata.subscription_scope);
  const targetUserId =
    readString(metadata.photographer_id) ||
    readString(metadata.attendee_id) ||
    readString(metadata.user_id);
  if (scope && targetUserId) {
    const amountMinor =
      readNumber(metadata.pricing_amount_cents) ??
      (readNumber(data.charged_amount) !== null
        ? Math.round(Number(data.charged_amount) * 100)
        : readNumber(data.amount) !== null
          ? Math.round(Number(data.amount) * 100)
          : 0);
    const currency = readString(data.currency) || readString(metadata.pricing_currency) || 'USD';
    await emitFinancialInAppNotification(supabase, {
      userId: targetUserId,
      templateCode: 'subscription_failed',
      subject: 'Subscription payment failed',
      body: `We could not process your subscription payment of ${String(currency).toUpperCase()} ${(Math.max(0, Number(amountMinor || 0)) / 100).toFixed(2)}.`,
      dedupeKey: `subscription_failed:flutterwave:${scope}:${data.tx_ref || data.id}`,
      metadata: {
        scope,
        flutterwave_tx_ref: data.tx_ref,
        flutterwave_tx_id: String(data.id),
        amount_minor: Number(amountMinor || 0),
        currency: String(currency).toUpperCase(),
      },
    }).catch(() => {
      // Best effort notification.
    });
  }
}

async function handleTransferCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  data: FlutterwaveWebhookPayload['data']
) {
  // This is for payouts - update payout status
  const { error } = await supabase
    .from('payouts')
    .update({
      status: data.status === 'successful' ? 'completed' : 'failed',
      provider_payout_id: String(data.id),
      completed_at: new Date().toISOString(),
    })
    .eq('provider_payout_id', data.tx_ref);

  if (error) {
    console.error('Failed to update payout status:', error);
  }
}

async function handleSubscriptionLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
  eventType: string,
  data: FlutterwaveWebhookPayload['data']
) {
  await syncRecurringFromFlutterwaveData(supabase, eventType, data);
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
      console.error('Flutterwave drop-in processing trigger failed:', await processResponse.text());
    }
  } catch (error) {
    console.error('Failed to trigger drop-in processing from Flutterwave webhook:', error);
  }
}

async function handleDropInPaymentSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    dropInPhotoId: string | null;
    attendeeId: string | null;
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

async function handleDropInCreditPurchaseSuccess(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    purchaseId: string | null;
    attendeeId: string | null;
    transactionRef: string;
    currency: string | null;
    amountMinor: number;
  }
) {
  const purchaseId = readString(params.purchaseId);
  if (!purchaseId) return;

  const { data: purchase } = await supabase
    .from('drop_in_credit_purchases')
    .select('id, attendee_id, credits_purchased, status')
    .eq('id', purchaseId)
    .maybeSingle();

  if (!purchase || purchase.status !== 'pending') return;

  const { data: activated } = await supabase
    .from('drop_in_credit_purchases')
    .update({
      status: 'active',
      credits_remaining: purchase.credits_purchased,
      payment_intent_id: params.transactionRef || null,
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

  if (Number(params.amountMinor || 0) > 0) {
    await recordDropInCreditPurchaseJournal(supabase, {
      purchaseId: purchase.id,
      attendeeId: purchase.attendee_id || readString(params.attendeeId) || '',
      amountMinor: Math.max(0, Math.round(Number(params.amountMinor || 0))),
      currency: String(params.currency || 'USD').toUpperCase(),
      provider: 'flutterwave',
      metadata: {
        flutterwave_tx_ref: params.transactionRef,
      },
    }).catch((ledgerError) => {
      console.error('[LEDGER] failed to record flutterwave drop-in credit purchase journal:', ledgerError);
    });
  }
}

async function syncRecurringFromFlutterwaveData(
  supabase: ReturnType<typeof createServiceClient>,
  eventType: string,
  data: FlutterwaveWebhookPayload['data'],
  statusOverride?: string
) {
  const metadata = parseMetadataRecord(data.meta);
  const scope = normalizeScope(metadata.subscription_scope);
  if (!scope) return;

  const providerStatus = statusOverride || readString(data.status) || eventType;
  const mappedStatus = mapProviderSubscriptionStatusToLocal(providerStatus, scope) || 'past_due';
  const fallbackExternalId =
    readString(metadata.subscription_id) ||
    readString(metadata.provider_subscription_id) ||
    readString(metadata.payment_plan) ||
    readString(data.subscription_id) ||
    readString(data.payment_plan) ||
    readString(data.plan) ||
    readString(data.tx_ref) ||
    String(data.id);
  const amountCentsFromCharge =
    readNumber(data.charged_amount) !== null
      ? Math.round(Number(data.charged_amount) * 100)
      : readNumber(data.amount) !== null
        ? Math.round(Number(data.amount) * 100)
        : null;

  await syncRecurringSubscriptionRecord({
    supabase,
    provider: 'flutterwave',
    scope,
    status: mappedStatus,
    eventType,
    externalSubscriptionId: fallbackExternalId,
    externalCustomerId:
      readString(metadata.external_customer_id) ||
      (data.customer?.id ? String(data.customer.id) : null) ||
      readString(data.customer?.email),
    externalPlanId:
      readString(metadata.provider_plan_id) ||
      readString(metadata.payment_plan) ||
      readString(data.payment_plan) ||
      readString(data.plan),
    billingCycle: readString(metadata.billing_cycle) || 'monthly',
    currency: readString(data.currency) || readString(metadata.pricing_currency) || 'USD',
    amountCents: readNumber(metadata.pricing_amount_cents) ?? amountCentsFromCharge,
    currentPeriodStart: readString(metadata.current_period_start) || readString(data.charged_at),
    currentPeriodEnd: readString(metadata.current_period_end),
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
      flutterwave_tx_ref: data.tx_ref,
      flutterwave_event: eventType,
    },
  });
}

function normalizeScope(value: unknown): SubscriptionScope | null {
  if (value === 'creator_subscription') return 'creator_subscription';
  if (value === 'attendee_subscription') return 'attendee_subscription';
  if (value === 'vault_subscription') return 'vault_subscription';
  return null;
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

  await recordSettlementJournalForTransaction(supabase, {
    transactionId: transaction.id,
    flowType: 'photo_purchase',
    sourceKind: 'transaction',
    sourceId: transaction.id,
    description: 'Photo purchase settled via Flutterwave webhook',
    metadata: {
      provider_event: 'charge.completed',
    },
  }).catch((ledgerError) => {
    console.error('[LEDGER] failed to record flutterwave photo purchase settlement journal:', ledgerError);
  });
}

