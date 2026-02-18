export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  verifyPaystackWebhookSignatureAsync,
} from '@/lib/payments/paystack';
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from '@/lib/payments/webhook-ledger';
import { createServiceClient } from '@/lib/supabase/server';

interface PaystackWebhookPayload {
  event: string;
  data: {
    id?: number;
    reference?: string;
    status?: string;
    fees?: number;
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
      if (payload.event === 'charge.success') {
        await handleChargeSuccess(supabase, payload);
      } else if (payload.event === 'charge.failed') {
        await handleChargeFailure(supabase, payload);
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

  const { error } = await (supabase
    .from('transactions') as any)
    .update({ status: 'failed' })
    .eq('paystack_reference', reference);

  if (error) {
    console.error('Failed to mark paystack transaction failed:', error);
  }
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

async function createEntitlements(
  supabase: ReturnType<typeof createServiceClient>,
  transaction: {
    id: string;
    event_id: string;
    attendee_id: string | null;
    metadata: unknown;
  }
) {
  const metadata = transaction.metadata as {
    media_ids?: string[];
    unlock_all?: boolean;
  };

  const unlockAll = metadata?.unlock_all;
  const mediaIds = metadata?.media_ids || [];

  if (unlockAll) {
    await supabase.from('entitlements').insert({
      event_id: transaction.event_id,
      transaction_id: transaction.id,
      attendee_id: transaction.attendee_id,
      entitlement_type: 'bulk',
    });
    return;
  }

  if (mediaIds.length > 0) {
    const entitlements = mediaIds.map((mediaId) => ({
      event_id: transaction.event_id,
      transaction_id: transaction.id,
      attendee_id: transaction.attendee_id,
      media_id: mediaId,
      entitlement_type: 'single' as const,
    }));
    await supabase.from('entitlements').insert(entitlements);
  }
}
