export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

import { 
  processPayout, 
  processPendingPayouts, 
  getPayoutQueue,
  retryFailedPayouts,
} from '@/lib/payments/payout-service';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const IDEMPOTENCY_DEPRECATION_WARNING =
  '299 - "idempotencyKey in request body is deprecated; send Idempotency-Key header instead."';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function buildRequestHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

async function isAdmin(
  supabase: any,
  user: { id: string; email?: string | null }
): Promise<boolean> {
  if (!user.email) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  return !!data;
}

// GET: Get payout queue and statistics
export async function GET(request: Request) {
  try {
    // Verify admin access
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !(await isAdmin(supabase, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'queue';

    const serviceClient = createServiceClient();

    if (view === 'queue') {
      const queue = await getPayoutQueue();
      return NextResponse.json(queue);
    }

    if (view === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');

      const { data: payouts, count } = await serviceClient
        .from('payouts')
        .select(`
          *,
          wallets (
            provider,
            momo_provider,
            momo_account_number,
            photographers (
              display_name,
              email
            )
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return NextResponse.json({
        payouts,
        total: count,
        limit,
        offset,
      });
    }

    if (view === 'pending') {
      const { data: pending } = await serviceClient
        .from('wallet_balances')
        .select(`
          *,
          wallets:wallet_id (
            provider,
            momo_provider,
            photographers:photographer_id (
              display_name,
              email
            )
          )
        `)
        .gt('available_balance', 0)
        .order('available_balance', { ascending: false });

      return NextResponse.json({ pending });
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  } catch (error) {
    console.error('Admin payouts GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payout data' },
      { status: 500 }
    );
  }
}

// POST: Process payouts
export async function POST(request: Request) {
  let idempotencyFinalizeRef:
    | ((
        status: 'completed' | 'failed',
        responseCode: number,
        payload: Record<string, unknown>
      ) => Promise<void>)
    | null = null;
  let responseHeaders: HeadersInit = {};

  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !(await isAdmin(supabase, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, walletId, amount, currency } = body;

    switch (action) {
      case 'single': {
        // Process single payout
        if (!walletId || !amount) {
          return NextResponse.json(
            { error: 'walletId and amount required' },
            { status: 400 }
          );
        }

        const bodyIdempotencyKey = body?.idempotencyKey;
        const headerIdempotencyKey =
          request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');

        if (headerIdempotencyKey && bodyIdempotencyKey && headerIdempotencyKey !== bodyIdempotencyKey) {
          return NextResponse.json(
            { error: 'Idempotency key mismatch between header and body' },
            { status: 400 }
          );
        }

        const idempotencyKey = String(headerIdempotencyKey || bodyIdempotencyKey || '').trim();
        if (!idempotencyKey) {
          return NextResponse.json(
            { error: 'Idempotency key is required via Idempotency-Key header' },
            { status: 400 }
          );
        }

        if (!headerIdempotencyKey && bodyIdempotencyKey) {
          responseHeaders = {
            Warning: IDEMPOTENCY_DEPRECATION_WARNING,
            'X-Idempotency-Key-Deprecated': 'true',
          };
        }

        const operationScope = 'payout.manual.process';
        const requestHash = buildRequestHash({
          actorId: user.id,
          action: 'single',
          walletId,
          amount,
          currency: currency || 'USD',
        });
        let idempotencyRecordId: string | null = null;
        let idempotencyFinalized = false;
        const claimTimestamp = new Date().toISOString();

        const finalizeIdempotency = async (
          status: 'completed' | 'failed',
          responseCode: number,
          payload: Record<string, unknown>
        ) => {
          if (!idempotencyRecordId || idempotencyFinalized) return;
          idempotencyFinalized = true;
          await serviceClient
            .from('api_idempotency_keys')
            .update({
              status,
              response_code: responseCode,
              response_payload: status === 'completed' ? payload : null,
              error_payload: status === 'failed' ? payload : null,
              last_seen_at: new Date().toISOString(),
            })
            .eq('id', idempotencyRecordId);
        };
        idempotencyFinalizeRef = finalizeIdempotency;

        const respond = async (
          payload: Record<string, unknown>,
          responseCode: number,
          status?: 'completed' | 'failed'
        ) => {
          const enriched = {
            ...payload,
            idempotencyKey,
            replayed: false,
          };
          if (status) {
            await finalizeIdempotency(status, responseCode, enriched);
          }
          return NextResponse.json(enriched, { status: responseCode, headers: responseHeaders });
        };

        const { data: claimedIdempotency, error: claimError } = await serviceClient
          .from('api_idempotency_keys')
          .insert({
            operation_scope: operationScope,
            actor_id: user.id,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            status: 'processing',
            last_seen_at: claimTimestamp,
          })
          .select('id')
          .single();

        if (claimError) {
          if (claimError.code !== '23505') {
            throw claimError;
          }

          const { data: existingIdempotency } = await serviceClient
            .from('api_idempotency_keys')
            .select('*')
            .eq('operation_scope', operationScope)
            .eq('actor_id', user.id)
            .eq('idempotency_key', idempotencyKey)
            .single();

          if (!existingIdempotency) {
            throw claimError;
          }

          await serviceClient
            .from('api_idempotency_keys')
            .update({ last_seen_at: claimTimestamp })
            .eq('id', existingIdempotency.id);

          if (existingIdempotency.request_hash !== requestHash) {
            return NextResponse.json(
              {
                error: 'Idempotency key was already used with a different request payload',
                idempotencyKey,
                replayed: false,
              },
              { status: 409, headers: responseHeaders }
            );
          }

          if (existingIdempotency.status === 'completed' && existingIdempotency.response_payload) {
            const headers = { ...responseHeaders, 'Idempotency-Replayed': 'true' };
            return NextResponse.json(existingIdempotency.response_payload as Record<string, unknown>, {
              status: existingIdempotency.response_code || 200,
              headers,
            });
          }

          if (existingIdempotency.status === 'failed' && existingIdempotency.error_payload) {
            const headers = { ...responseHeaders, 'Idempotency-Replayed': 'true' };
            return NextResponse.json(existingIdempotency.error_payload as Record<string, unknown>, {
              status: existingIdempotency.response_code || 400,
              headers,
            });
          }

          return NextResponse.json(
            {
              error: 'Payout request is already being processed with this idempotency key',
              idempotencyKey,
              replayed: false,
            },
            { status: 409, headers: responseHeaders }
          );
        }

        idempotencyRecordId = claimedIdempotency.id;

        const result = await processPayout({
          walletId,
          amount,
          currency: currency || 'USD',
          mode: 'manual',
          identityKey: `manual:${user.id}:${idempotencyKey}`,
        });

        return respond({ ...result }, 200, 'completed');
      }

      case 'batch-threshold': {
        // Process all pending payouts above threshold
        const result = await processPendingPayouts('threshold');
        return NextResponse.json(result);
      }

      case 'batch-all': {
        // Process all pending payouts (scheduled mode)
        const result = await processPendingPayouts('scheduled');
        return NextResponse.json(result);
      }

      case 'retry-failed': {
        // Retry failed payouts
        const result = await retryFailedPayouts();
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Admin payouts POST error:', error);
    const errorPayload = { error: 'Failed to process payout' };
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', 500, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: 500, headers: responseHeaders });
  }
}

