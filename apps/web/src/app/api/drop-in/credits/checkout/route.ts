export const dynamic = 'force-dynamic';

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
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const credits = Number.parseInt(String(body?.credits || ''), 10);

    if (!Number.isFinite(credits) || credits < 1 || credits > 1000) {
      return NextResponse.json(
        { error: 'Credits must be between 1 and 1000' },
        { status: 400 }
      );
    }

    const pricing = await getCreditPricing(user.id, request.headers);
    if (!Number.isFinite(pricing.creditUnitCents) || pricing.creditUnitCents <= 0) {
      return NextResponse.json(
        { error: 'Drop-in credit pricing is not configured by admin', failClosed: true },
        { status: 503 }
      );
    }

    const amountCents = Math.round(pricing.creditUnitCents * credits);
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid purchase amount' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const attendeeId = await ensureAttendeeId(serviceClient, {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata || {},
    });

    if (!attendeeId) {
      return NextResponse.json({ error: 'Failed to resolve attendee profile' }, { status: 500 });
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
      return NextResponse.json({ error: 'Failed to create credit purchase' }, { status: 500 });
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
        return NextResponse.json(
          {
            error: gatewayError.message,
            failClosed: gatewayError.failClosed,
            code: gatewayError.code,
          },
          { status: 503 }
        );
      }
      throw gatewayError;
    }

    const selectedGateway = gatewaySelection.availableGateways.includes('paystack')
      ? 'paystack'
      : gatewaySelection.gateway;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (selectedGateway === 'paystack') {
      const secretKey = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      const publicKey = await resolvePaystackPublicKey(gatewaySelection.countryCode);
      if (!secretKey || !publicKey) {
        return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
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

      return NextResponse.json({
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
      });
    }

    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
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

      return NextResponse.json({
        success: true,
        provider: 'stripe',
        purchaseId: purchase.id,
        checkoutUrl: session.url,
      });
    }

    return NextResponse.json(
      {
        error: `Drop-in credit checkout is not yet enabled for ${selectedGateway}`,
        failClosed: true,
      },
      { status: 503 }
    );
  } catch (error: any) {
    console.error('Drop-in credits checkout error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start drop-in credits checkout' },
      { status: 500 }
    );
  }
}

