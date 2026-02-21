export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { convertCurrency, getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency/currency-service';
import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';
import { GatewaySelectionError, selectPaymentGateway } from '@/lib/payments/gateway-selector';
import {
  initializePaystackPayment,
  resolvePaystackPublicKey,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import { stripe } from '@/lib/payments/stripe';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
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

function extractMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;

  const quoted = error.message.match(/column\s+"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];

  const bare = error.message.match(/column\s+([a-zA-Z0-9_]+)/i);
  return bare?.[1] || null;
}

function needsFaceTag(error: any): boolean {
  if (error?.code !== '23502' || typeof error?.message !== 'string') return false;
  const message = error.message.toLowerCase();
  return message.includes('face_tag') || message.includes('face_tag_suffix');
}

async function tryInsertAttendeeProfile(
  serviceClient: ReturnType<typeof createServiceClient>,
  payload: Record<string, any>
) {
  return serviceClient
    .from('attendees')
    .insert(payload)
    .select('id')
    .single();
}

async function ensureAttendeeId(
  serviceClient: ReturnType<typeof createServiceClient>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> }
) {
  let { data: attendee } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
  if (attendee?.id) return attendee.id;

  const usernameSeed =
    String(user.user_metadata?.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
    String(user.user_metadata?.display_name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
    String(user.email || '')
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') ||
    `user_${Date.now()}`;
  const username = usernameSeed.slice(0, 12) || 'user0001';
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
  const normalizedCountryCode =
    typeof user.user_metadata?.country_code === 'string' &&
    /^[A-Za-z]{2}$/.test(user.user_metadata.country_code.trim())
      ? user.user_metadata.country_code.trim().toUpperCase()
      : null;

  const nextFaceTag = (base: string) => {
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const tagBase = base.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
    return {
      faceTag: `@${tagBase}${suffix}`,
      suffix,
    };
  };
  const initialTag = nextFaceTag(username);

  let payload: Record<string, any> = {
    id: user.id,
    display_name: displayName,
    email: user.email,
    username,
    country_code: normalizedCountryCode,
    face_tag: initialTag.faceTag,
    face_tag_suffix: initialTag.suffix,
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    const createResult = await tryInsertAttendeeProfile(serviceClient, payload);
    if (!createResult.error && createResult.data?.id) {
      return createResult.data.id as string;
    }

    const error = createResult.error;
    if (!error) break;

    const missingColumn = extractMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const { [missingColumn]: _omitted, ...nextPayload } = payload;
      void _omitted;
      payload = nextPayload;
      continue;
    }

    if (needsFaceTag(error)) {
      const nextTag = nextFaceTag(username);
      payload.face_tag = nextTag.faceTag;
      payload.face_tag_suffix = nextTag.suffix;
      continue;
    }

    if (
      error.code === '23505' &&
      typeof error.message === 'string' &&
      (error.message.toLowerCase().includes('username') ||
        error.message.toLowerCase().includes('face_tag') ||
        error.message.toLowerCase().includes('username_registry'))
    ) {
      const nextTag = nextFaceTag(username);
      payload.username = `${username.slice(0, 8)}${Math.floor(10 + Math.random() * 89)}`;
      payload.face_tag = nextTag.faceTag;
      payload.face_tag_suffix = nextTag.suffix;
      continue;
    }

    break;
  }

  const byId = await serviceClient
    .from('attendees')
    .select('id')
    .eq('id', user.id)
    .limit(1)
    .maybeSingle();

  if (byId.data?.id) return byId.data.id;

  return null;
}

async function getCreditPricing(userId: string | undefined, requestHeaders: Headers) {
  const pricing = await resolveDropInPricingConfig();
  const detectedCountry = getCountryFromRequest(requestHeaders);
  const effectiveCurrency = await getEffectiveCurrency(userId, detectedCountry || undefined);

  let creditUnitCents = pricing.creditUnitCents;
  let currencyCode = pricing.currencyCode;

  if (effectiveCurrency && effectiveCurrency !== pricing.currencyCode) {
    creditUnitCents = await convertCurrency(pricing.creditUnitCents, pricing.currencyCode, effectiveCurrency);
    currencyCode = effectiveCurrency;
  }

  return {
    creditUnitCents,
    currencyCode,
    currencyLower: currencyCode.toLowerCase(),
  };
}

export async function POST(request: NextRequest) {
  let idempotencyFinalizeRef:
    | ((
        status: 'completed' | 'failed',
        responseCode: number,
        payload: Record<string, unknown>,
        transactionId?: string
      ) => Promise<void>)
    | null = null;
  let responseHeaders: HeadersInit = {};

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
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

    const credits = Number.parseInt(String(body?.credits || ''), 10);

    if (!Number.isFinite(credits) || credits < 1 || credits > 1000) {
      return NextResponse.json(
        { error: 'Credits must be between 1 and 1000' },
        { status: 400 }
      );
    }

    const operationScope = 'dropin.credits.checkout.create';
    const requestHash = buildRequestHash({
      actorId: user.id,
      credits,
    });
    const serviceClient = createServiceClient();
    let idempotencyRecordId: string | null = null;
    let idempotencyFinalized = false;
    const claimTimestamp = new Date().toISOString();

    const finalizeIdempotency = async (
      status: 'completed' | 'failed',
      responseCode: number,
      payload: Record<string, unknown>,
      transactionId?: string
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
          transaction_id: transactionId || null,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', idempotencyRecordId);
    };
    idempotencyFinalizeRef = finalizeIdempotency;

    const respond = async (
      payload: Record<string, unknown>,
      responseCode: number,
      status?: 'completed' | 'failed',
      transactionId?: string
    ) => {
      const enriched = {
        ...payload,
        idempotencyKey,
        replayed: false,
      };
      if (status) {
        await finalizeIdempotency(status, responseCode, enriched, transactionId);
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
          error: 'Checkout request is already being processed with this idempotency key',
          idempotencyKey,
          replayed: false,
        },
        { status: 409, headers: responseHeaders }
      );
    }

    idempotencyRecordId = claimedIdempotency.id;

    const pricing = await getCreditPricing(user.id, request.headers);
    if (!Number.isFinite(pricing.creditUnitCents) || pricing.creditUnitCents <= 0) {
      return respond(
        { error: 'Drop-in credit pricing is not configured by admin', failClosed: true },
        503,
        'failed'
      );
    }

    const amountCents = Math.round(pricing.creditUnitCents * credits);
    if (amountCents <= 0) {
      return respond({ error: 'Invalid purchase amount' }, 400, 'failed');
    }

    const attendeeId = await ensureAttendeeId(serviceClient, {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {},
    });

    if (!attendeeId) {
      return respond({ error: 'Failed to resolve attendee profile' }, 500, 'failed');
    }

    const { data: purchase, error: purchaseError } = await serviceClient
      .from('drop_in_credit_purchases')
      .insert({
        attendee_id: attendeeId,
        pack_id: null,
        credits_purchased: credits,
        credits_remaining: 0,
        amount_paid: amountCents,
        currency: pricing.currencyCode,
        status: 'pending',
      })
      .select('id')
      .single();

    if (purchaseError || !purchase?.id) {
      console.error('Drop-in credits purchase insert failed:', purchaseError);
      return respond({ error: 'Failed to create credit purchase' }, 500, 'failed');
    }

    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user.id,
        currency: pricing.currencyLower,
        productType: 'drop_in',
      });
    } catch (gatewayError) {
      if (gatewayError instanceof GatewaySelectionError) {
        return respond(
          {
            error: gatewayError.message,
            failClosed: gatewayError.failClosed,
            code: gatewayError.code,
          },
          503,
          'failed'
        );
      }
      throw gatewayError;
    }

    const selectedGateway = gatewaySelection.gateway;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (selectedGateway === 'paystack') {
      const secretKey = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      const publicKey = await resolvePaystackPublicKey(gatewaySelection.countryCode);
      if (!secretKey || !publicKey) {
        return respond({ error: 'Paystack is not configured' }, 500, 'failed');
      }

      const reference = `dropincredits_${purchase.id.replace(/-/g, '')}_${Date.now()}`;
      const callbackUrl = `${baseUrl}/gallery/billing?credits=success&provider=paystack&purchase_id=${encodeURIComponent(
        purchase.id
      )}&reference=${encodeURIComponent(reference)}`;

      const payment = await initializePaystackPayment(
        {
          reference,
          email: user.email || '',
          amount: amountCents,
          currency: pricing.currencyCode,
          callbackUrl,
          metadata: {
            type: 'drop_in_credit_purchase',
            attendee_id: attendeeId,
            purchase_id: purchase.id,
            credits_purchased: credits,
          },
        },
        secretKey
      );

      await serviceClient
        .from('drop_in_credit_purchases')
        .update({ payment_intent_id: payment.reference })
        .eq('id', purchase.id);

      return respond({
        success: true,
        provider: 'paystack',
        purchaseId: purchase.id,
        checkoutUrl: payment.authorizationUrl,
        paystack: {
          publicKey,
          email: user.email,
          amount: amountCents,
          currency: pricing.currencyCode,
          reference: payment.reference,
          accessCode: payment.accessCode,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return respond({ error: 'Stripe is not configured' }, 500, 'failed');
      }

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email || undefined,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: pricing.currencyLower,
              product_data: {
                name: `Drop-in Credits (${credits})`,
                description: `${credits} drop-in credits`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/gallery/billing?credits=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}&purchase_id=${purchase.id}`,
        cancel_url: `${baseUrl}/gallery/billing?credits=canceled&purchase_id=${purchase.id}`,
        metadata: {
          type: 'drop_in_credit_purchase',
          attendee_id: attendeeId,
          purchase_id: purchase.id,
          credits_purchased: String(credits),
        },
      });

      await serviceClient
        .from('drop_in_credit_purchases')
        .update({ payment_intent_id: session.id })
        .eq('id', purchase.id);

      return respond({
        success: true,
        provider: 'stripe',
        purchaseId: purchase.id,
        checkoutUrl: session.url,
      }, 200, 'completed');
    }

    return respond(
      {
        error: `Drop-in credit checkout is not yet enabled for ${selectedGateway}`,
        failClosed: true,
      },
      503,
      'failed'
    );
  } catch (error: any) {
    console.error('Drop-in credits checkout error:', error);
    const errorPayload = { error: error?.message || 'Failed to start drop-in credits checkout' };
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', 500, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: 500, headers: responseHeaders });
  }
}
