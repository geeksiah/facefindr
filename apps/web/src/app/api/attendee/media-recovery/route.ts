export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  createClient,
  createClientWithAccessToken,
  createServiceClient,
} from '@/lib/supabase/server';
import { restoreMediaRecoveryRequest } from '@/lib/media/recovery-service';

const ACTIVE_REQUEST_STATUSES = ['pending_payment', 'paid', 'restoring'] as const;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken ? createClientWithAccessToken(accessToken) : createClient();
}

async function canAccessEvent(supabase: any, userId: string, eventId: string | null) {
  if (!eventId) return false;

  const [{ data: consent }, { data: entitlement }] = await Promise.all([
    supabase
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', userId)
      .eq('event_id', eventId)
      .is('withdrawn_at', null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('entitlements')
      .select('id')
      .eq('attendee_id', userId)
      .eq('event_id', eventId)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(consent?.id || entitlement?.id);
}

async function resolveRecoveryQuote(supabase: any, userId: string, mediaId: string) {
  const { data: record, error } = await supabase
    .from('media_retention_records')
    .select(`
      id,
      media_id,
      event_id,
      status,
      grace_expires_at,
      purge_after,
      estimated_recovery_fee_cents
    `)
    .eq('media_id', mediaId)
    .maybeSingle();

  if (error || !record) {
    return { error: 'This photo is not currently recoverable.', status: 404 as const };
  }

  if (!['archived', 'soft_deleted', 'failed'].includes(record.status)) {
    return { error: 'This photo is not in a recoverable retention state.', status: 400 as const };
  }

  const allowed = await canAccessEvent(supabase, userId, record.event_id);
  if (!allowed) {
    return { error: 'You are not eligible to recover this photo.', status: 403 as const };
  }

  const now = new Date();
  const graceExpiresAt = toIso(record.grace_expires_at);
  const purgeAfter = toIso(record.purge_after);

  if (purgeAfter && new Date(purgeAfter) <= now) {
    return { error: 'Recovery window has expired for this photo.', status: 410 as const };
  }

  const inGrace = Boolean(graceExpiresAt && new Date(graceExpiresAt) > now);
  let quotedFeeCents = 0;

  if (!inGrace) {
    let totalBytes = 0;
    const { data: mediaRow } = await supabase
      .from('media')
      .select('file_size')
      .eq('id', mediaId)
      .maybeSingle();
    totalBytes = Math.max(0, Number(mediaRow?.file_size || 0));

    const { data: computedFee, error: feeError } = await supabase.rpc('compute_media_recovery_fee', {
      p_total_bytes: totalBytes,
    });
    if (feeError) {
      return { error: feeError.message || 'Failed to compute recovery fee', status: 500 as const };
    }
    quotedFeeCents = Number(record.estimated_recovery_fee_cents ?? computedFee ?? 0);
  }

  const expiresAt = purgeAfter || new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  return {
    data: {
      retentionRecordId: record.id as string,
      mediaId: record.media_id as string,
      eventId: (record.event_id as string | null) || null,
      status: record.status as string,
      mode: inGrace ? 'grace_free' : 'post_grace_paid',
      quotedFeeCents: Math.max(0, quotedFeeCents),
      currency: 'USD',
      graceExpiresAt,
      purgeAfter,
      quoteExpiresAt: expiresAt,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await getAuthClient(request);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mediaId = new URL(request.url).searchParams.get('mediaId') || '';
    if (!isUuid(mediaId)) {
      return NextResponse.json({ error: 'Valid mediaId is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const quote = await resolveRecoveryQuote(serviceClient, user.id, mediaId);
    if ('error' in quote) {
      return NextResponse.json({ error: quote.error }, { status: quote.status });
    }

    return NextResponse.json({ success: true, quote: quote.data });
  } catch (error) {
    console.error('Media recovery quote error:', error);
    return NextResponse.json({ error: 'Failed to load recovery quote' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await getAuthClient(request);
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const mediaId = typeof body.mediaId === 'string' ? body.mediaId : '';
    if (!isUuid(mediaId)) {
      return NextResponse.json({ error: 'Valid mediaId is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const quote = await resolveRecoveryQuote(serviceClient, user.id, mediaId);
    if ('error' in quote) {
      return NextResponse.json({ error: quote.error }, { status: quote.status });
    }

    const { data: existing } = await serviceClient
      .from('media_recovery_requests')
      .select('id, status, quoted_fee_cents, currency, expires_at, created_at')
      .eq('retention_record_id', quote.data.retentionRecordId)
      .eq('requester_user_id', user.id)
      .in('status', [...ACTIVE_REQUEST_STATUSES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const expiresAt = toIso(existing.expires_at);
      if (!expiresAt || new Date(expiresAt) > new Date()) {
        let restoreResult: any = null;
        if (existing.status === 'paid' || existing.status === 'restoring' || existing.status === 'failed') {
          restoreResult = await restoreMediaRecoveryRequest({
            requestId: existing.id,
            requesterUserId: user.id,
            confirmPayment: existing.status !== 'pending_payment',
            supabase: serviceClient,
          });
        }

        return NextResponse.json({
          success: true,
          request: {
            id: existing.id,
            status: existing.status,
            quotedFeeCents: Number(existing.quoted_fee_cents || 0),
            currency: existing.currency || 'USD',
            expiresAt,
          },
          quote: quote.data,
          restore: restoreResult,
        });
      }
    }

    const initialStatus = quote.data.quotedFeeCents > 0 ? 'pending_payment' : 'paid';
    const { data: inserted, error: insertError } = await serviceClient
      .from('media_recovery_requests')
      .insert({
        retention_record_id: quote.data.retentionRecordId,
        media_id: quote.data.mediaId,
        requester_user_id: user.id,
        status: initialStatus,
        quoted_fee_cents: quote.data.quotedFeeCents,
        currency: quote.data.currency,
        expires_at: quote.data.quoteExpiresAt,
      })
      .select('id, status, quoted_fee_cents, currency, expires_at')
      .maybeSingle();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create recovery request' },
        { status: 500 }
      );
    }

    let restoreResult: any = null;
    if (initialStatus === 'paid') {
      restoreResult = await restoreMediaRecoveryRequest({
        requestId: inserted.id,
        requesterUserId: user.id,
        confirmPayment: true,
        supabase: serviceClient,
      });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: inserted.id,
        status: inserted.status,
        quotedFeeCents: Number(inserted.quoted_fee_cents || 0),
        currency: inserted.currency || 'USD',
        expiresAt: toIso(inserted.expires_at),
      },
      quote: quote.data,
      restore: restoreResult,
    });
  } catch (error) {
    console.error('Media recovery request error:', error);
    return NextResponse.json({ error: 'Failed to create recovery request' }, { status: 500 });
  }
}
