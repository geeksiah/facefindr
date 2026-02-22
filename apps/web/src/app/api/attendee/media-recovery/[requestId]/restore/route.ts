export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { restoreMediaRecoveryRequest } from '@/lib/media/recovery-service';
import {
  createClient,
  createClientWithAccessToken,
  createServiceClient,
} from '@/lib/supabase/server';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken ? createClientWithAccessToken(accessToken) : createClient();
}

function transactionHasRecoveryRequest(metadata: Record<string, unknown> | null | undefined, requestId: string) {
  if (!metadata) return false;
  if (metadata.media_recovery_request_id === requestId) return true;
  if (metadata.mediaRecoveryRequestId === requestId) return true;

  const listValues = [
    metadata.media_recovery_request_ids,
    metadata.mediaRecoveryRequestIds,
  ];
  for (const value of listValues) {
    if (Array.isArray(value) && value.includes(requestId)) {
      return true;
    }
  }
  return false;
}

function mapStatusToHttp(status: string) {
  switch (status) {
    case 'restored':
      return 200;
    case 'payment_required':
      return 402;
    case 'not_found':
      return 404;
    case 'expired':
    case 'purged':
      return 410;
    case 'in_progress':
      return 202;
    case 'invalid_state':
      return 409;
    default:
      return 400;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const authClient = await getAuthClient(request);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestId = params.requestId;
    if (!isUuid(requestId)) {
      return NextResponse.json({ error: 'Invalid recovery request id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId : null;

    let confirmPayment = false;
    let paymentProvider: string | null = null;
    let paymentReference: string | null = null;

    if (transactionId) {
      if (!isUuid(transactionId)) {
        return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 });
      }

      const serviceClient = createServiceClient();
      const { data: transaction, error: transactionError } = await serviceClient
        .from('transactions')
        .select(`
          id,
          attendee_id,
          status,
          payment_provider,
          stripe_payment_intent_id,
          stripe_checkout_session_id,
          flutterwave_tx_ref,
          paypal_order_id,
          paystack_reference,
          metadata
        `)
        .eq('id', transactionId)
        .maybeSingle();

      if (transactionError || !transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      if (transaction.attendee_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (transaction.status !== 'succeeded') {
        return NextResponse.json({ error: 'Transaction is not completed' }, { status: 400 });
      }

      if (!transactionHasRecoveryRequest((transaction.metadata as any) || null, requestId)) {
        return NextResponse.json(
          { error: 'Transaction is not linked to this recovery request' },
          { status: 400 }
        );
      }

      confirmPayment = true;
      paymentProvider = transaction.payment_provider || null;
      const baseReference =
        transaction.paystack_reference ||
        transaction.stripe_payment_intent_id ||
        transaction.stripe_checkout_session_id ||
        transaction.flutterwave_tx_ref ||
        transaction.paypal_order_id ||
        transaction.id;
      paymentReference = `${paymentProvider || 'provider'}:${baseReference}:${requestId}`;
    }

    const restore = await restoreMediaRecoveryRequest({
      requestId,
      requesterUserId: user.id,
      confirmPayment,
      paymentProvider,
      paymentReference,
    });

    return NextResponse.json(restore, { status: mapStatusToHttp(restore.status) });
  } catch (error: any) {
    console.error('Media recovery restore error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to restore media' },
      { status: 500 }
    );
  }
}
