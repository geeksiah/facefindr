export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyWebhook, captureOrder } from '@/lib/payments/paypal';
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from '@/lib/payments/webhook-ledger';
import { createServiceClient } from '@/lib/supabase/server';

const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  resource: {
    id: string;
    status: string;
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
    ['paypal-transmission-id', 'paypal-transmission-time', 'paypal-cert-url', 'paypal-transmission-sig'].forEach((key) => {
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
      transaction_id: transaction.id,
      attendee_id: transaction.attendee_id,
      entitlement_type: 'bulk',
    });
  } else if (mediaIds.length > 0) {
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

async function handleCaptureFailed(
  supabase: ReturnType<typeof createServiceClient>,
  resource: PayPalWebhookPayload['resource'],
  eventType: string
) {
  const status = eventType === 'PAYMENT.CAPTURE.REFUNDED' ? 'refunded' : 'failed';

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
      await supabase.from('entitlements').delete().eq('transaction_id', transaction.id);
    }
  }
}

