export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyWebhookSignature, verifyTransaction } from '@/lib/payments/flutterwave';
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from '@/lib/payments/webhook-ledger';
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

        default:
          console.log(`Unhandled Flutterwave event: ${payload.event}`);
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

  // Create entitlements
  await createEntitlements(supabase, transaction);
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

