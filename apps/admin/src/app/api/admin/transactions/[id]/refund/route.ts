import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface TransactionRow {
  id: string;
  status: string;
  currency: string;
  gross_amount: number;
  payment_provider: string | null;
  stripe_payment_intent_id: string | null;
  paypal_capture_id: string | null;
  paypal_order_id: string | null;
  flutterwave_tx_id: string | null;
  paystack_transaction_id: string | null;
  paystack_reference: string | null;
  metadata: Record<string, unknown> | null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (!payload) {
    return `Provider request failed (${response.status})`;
  }

  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.error_description === 'string') return payload.error_description;

  return `Provider request failed (${response.status})`;
}

async function refundStripe(transaction: TransactionRow) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe credentials are not configured');
  if (!transaction.stripe_payment_intent_id) {
    throw new Error('Stripe payment intent ID missing on transaction');
  }

  const body = new URLSearchParams();
  body.set('payment_intent', transaction.stripe_payment_intent_id);

  const response = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  return {
    refundId: payload.id as string,
    status: payload.status as string,
  };
}

async function createPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are not configured');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const baseUrl = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Failed to acquire PayPal access token');
  }

  return {
    accessToken: String(payload.access_token),
    baseUrl,
  };
}

async function refundPayPal(transaction: TransactionRow) {
  if (!transaction.paypal_capture_id) {
    throw new Error('PayPal capture ID missing on transaction');
  }

  const { accessToken, baseUrl } = await createPayPalAccessToken();
  const response = await fetch(
    `${baseUrl}/v2/payments/captures/${encodeURIComponent(transaction.paypal_capture_id)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          currency_code: String(transaction.currency || 'USD').toUpperCase(),
          value: (Number(transaction.gross_amount || 0) / 100).toFixed(2),
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  return {
    refundId: payload.id as string,
    status: payload.status as string,
  };
}

async function refundFlutterwave(transaction: TransactionRow) {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error('Flutterwave credentials are not configured');
  if (!transaction.flutterwave_tx_id) {
    throw new Error('Flutterwave transaction ID missing on transaction');
  }

  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction.flutterwave_tx_id)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Number(transaction.gross_amount || 0) / 100,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  return {
    refundId: String(payload?.data?.id || ''),
    status: String(payload?.data?.status || payload?.status || 'pending'),
  };
}

async function refundPaystack(transaction: TransactionRow) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('Paystack credentials are not configured');

  const reference = transaction.paystack_reference || null;
  const transactionId = transaction.paystack_transaction_id || null;

  if (!reference && !transactionId) {
    throw new Error('Paystack transaction reference missing on transaction');
  }

  const response = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(transactionId ? { transaction: transactionId } : {}),
      ...(reference && !transactionId ? { transaction: reference } : {}),
      currency: String(transaction.currency || 'USD').toUpperCase(),
      amount: Number(transaction.gross_amount || 0),
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = await response.json();
  return {
    refundId: String(payload?.data?.id || ''),
    status: String(payload?.data?.status || payload?.status || 'pending'),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('transactions.refund'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .select(
        'id, status, currency, gross_amount, payment_provider, stripe_payment_intent_id, paypal_capture_id, paypal_order_id, flutterwave_tx_id, paystack_transaction_id, paystack_reference, metadata'
      )
      .eq('id', params.id)
      .single();

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const tx = transaction as TransactionRow;

    if (tx.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'Only succeeded transactions can be refunded' },
        { status: 409 }
      );
    }

    const provider = String(tx.payment_provider || 'stripe');
    let providerResult: { refundId: string; status: string };

    if (provider === 'stripe') {
      providerResult = await refundStripe(tx);
    } else if (provider === 'paypal') {
      providerResult = await refundPayPal(tx);
    } else if (provider === 'flutterwave') {
      providerResult = await refundFlutterwave(tx);
    } else if (provider === 'paystack') {
      providerResult = await refundPaystack(tx);
    } else {
      return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
    }

    const metadata = {
      ...(tx.metadata || {}),
      refund: {
        provider,
        refund_id: providerResult.refundId,
        refund_status: providerResult.status,
        refunded_by_admin: session.adminId,
        refunded_at: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: 'refunded',
        metadata,
      })
      .eq('id', tx.id);

    if (updateError) {
      console.error('Transaction refund update failed:', updateError);
      return NextResponse.json({ error: 'Refund succeeded but local update failed' }, { status: 500 });
    }

    await supabaseAdmin.from('entitlements').delete().eq('transaction_id', tx.id);

    await logAction('refund_issue', 'transaction', tx.id, {
      provider,
      refund_id: providerResult.refundId,
      refund_status: providerResult.status,
    });

    return NextResponse.json({
      success: true,
      refund: {
        provider,
        refund_id: providerResult.refundId,
        status: providerResult.status,
      },
    });
  } catch (error) {
    console.error('Issue refund error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to issue refund' },
      { status: 500 }
    );
  }
}
