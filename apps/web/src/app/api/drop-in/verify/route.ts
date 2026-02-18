export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

function deriveStatus(row: {
  upload_payment_status: string | null;
  gift_payment_status: string | null;
  face_processing_status: string | null;
  matches_found: number | null;
  is_discoverable: boolean | null;
}) {
  if (row.upload_payment_status === 'failed' || row.gift_payment_status === 'failed') {
    return 'failed_payment';
  }

  if (row.upload_payment_status !== 'paid') {
    return 'awaiting_payment';
  }

  if (row.face_processing_status === 'failed') {
    return 'processing_failed';
  }

  if (row.face_processing_status === 'completed') {
    return 'completed';
  }

  return 'processing';
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const txRef =
      searchParams.get('session_id') ||
      searchParams.get('sessionId') ||
      searchParams.get('tx_ref') ||
      searchParams.get('txRef') ||
      searchParams.get('order_id') ||
      searchParams.get('orderId') ||
      searchParams.get('reference') ||
      null;
    const photoId =
      searchParams.get('photo_id') ||
      searchParams.get('drop_in_photo_id') ||
      null;
    const latest = searchParams.get('latest') === '1';

    if (!txRef && !photoId && !latest) {
      return NextResponse.json(
        { error: 'Missing status reference. Provide tx_ref, session_id, order_id, reference, or photo_id.' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('drop_in_photos')
      .select(
        'id, upload_payment_status, gift_payment_status, face_processing_status, matches_found, is_discoverable, upload_payment_transaction_id, created_at, updated_at'
      )
      .eq('uploader_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (txRef) {
      query = query.eq('upload_payment_transaction_id', txRef);
    } else if (photoId) {
      query = query.eq('id', photoId);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('Drop-in verify query failed:', error);
      return NextResponse.json({ error: 'Failed to verify drop-in status' }, { status: 500 });
    }

    const row = rows?.[0];
    if (!row) {
      return NextResponse.json(
        { error: 'Drop-in record not found yet', pending: true },
        { status: 404 }
      );
    }

    const status = deriveStatus(row);

    return NextResponse.json({
      success: true,
      status,
      ready: status === 'completed' || status === 'processing_failed' || status === 'failed_payment',
      dropInPhoto: {
        id: row.id,
        transactionRef: row.upload_payment_transaction_id,
        uploadPaymentStatus: row.upload_payment_status,
        giftPaymentStatus: row.gift_payment_status,
        processingStatus: row.face_processing_status,
        matchesFound: row.matches_found || 0,
        discoverable: !!row.is_discoverable,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Drop-in verify error:', error);
    return NextResponse.json({ error: 'Failed to verify drop-in status' }, { status: 500 });
  }
}

