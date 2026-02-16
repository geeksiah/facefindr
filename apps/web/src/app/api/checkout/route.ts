export const dynamic = 'force-dynamic';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { getEffectiveCurrency } from '@/lib/currency/currency-service';
import { getAppUrl } from '@/lib/env';
import { calculateFees, calculateBulkPrice } from '@/lib/payments/fee-calculator';
import {
  initializePayment,
  isFlutterwaveConfigured,
} from '@/lib/payments/flutterwave';
import { GatewaySelectionError, selectPaymentGateway } from '@/lib/payments/gateway-selector';
import {
  createOrder,
  getApprovalUrl,
  isPayPalConfigured,
} from '@/lib/payments/paypal';
import {
  createCheckoutSession,
  isStripeConfigured,
} from '@/lib/payments/stripe';
import { checkRateLimit, getClientIP, rateLimitHeaders, rateLimits } from '@/lib/rate-limit';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : createClient();
}

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

function buildCheckoutRequestHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export async function POST(request: NextRequest) {
  // Rate limiting for checkout
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, rateLimits.api);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let idempotencyFinalizeRef:
    | ((
        status: 'completed' | 'failed',
        responseCode: number,
        payload: Record<string, unknown>,
        transactionId?: string
      ) => Promise<void>)
    | null = null;

  try {
    const supabase = await getAuthClient(request);
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const {
      eventId,
      mediaIds,
      unlockAll,
      provider,
      currency,
      customerEmail,
      idempotencyKey: bodyIdempotencyKey, // backward-compat body key
    } = body;

    const headerIdempotencyKey = request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');
    const idempotencyKey = String(headerIdempotencyKey || bodyIdempotencyKey || '').trim();
    const actorId = user?.id || `guest:${String(customerEmail || '').trim().toLowerCase() || 'anonymous'}`;
    const idempotencyScope = 'checkout.create';
    const requestHash = buildCheckoutRequestHash({
      eventId,
      mediaIds: Array.isArray(mediaIds) ? [...mediaIds].sort() : [],
      unlockAll: Boolean(unlockAll),
      provider: provider || null,
      currency: currency || null,
      customerEmail: customerEmail || null,
      actorId,
    });
    let idempotencyRecordId: string | null = null;
    let idempotencyFinalized = false;

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
      if (status) {
        await finalizeIdempotency(status, responseCode, payload, transactionId);
      }
      return NextResponse.json(payload, { status: responseCode });
    };

    // Validate idempotency key
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency key is required via Idempotency-Key header or request body' },
        { status: 400 }
      );
    }

    // Validate event exists and get pricing
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        *,
        event_pricing (*),
        photographers!inner (
          id,
          display_name,
          business_name
        )
      `)
      .eq('id', eventId)
      .eq('status', 'active')
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found or not active' }, { status: 404 });
    }

    // Check photographer has active subscription (required for payments)
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_code, status')
      .eq('photographer_id', event.photographer_id)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      return NextResponse.json(
        { error: 'Creator must have an active subscription to accept payments' },
        { status: 403 }
      );
    }

    // Free plan cannot accept payments
    if (subscription.plan_code === 'free') {
      return NextResponse.json(
        { error: 'Free plan photographers cannot accept payments. Please upgrade your subscription.' },
        { status: 403 }
      );
    }

    const pricing = event.event_pricing?.[0];
    if (!pricing || pricing.is_free || pricing.pricing_type === 'free') {
      return NextResponse.json(
        { error: 'This event does not have paid photos' },
        { status: 400 }
      );
    }

    // Determine transaction currency (use attendee's currency preference or event currency)
    const eventCurrency = event.currency_code || pricing.currency || 'USD';
    const transactionCurrency = currency || await getEffectiveCurrency(user?.id, event.country_code || undefined) || eventCurrency;

    // Select payment gateway based on user preference, country, and availability
    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user?.id || '',
        photographerId: event.photographer_id,
        currency: transactionCurrency,
        countryCode: event.country_code || undefined,
        productType: 'event_checkout',
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

    // Use selected gateway (or override with provided provider if valid)
    const selectedProvider = provider && gatewaySelection.availableGateways.includes(provider as any)
      ? provider
      : gatewaySelection.gateway;

    // Get photographer's wallet for selected provider
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('photographer_id', event.photographer_id)
      .eq('provider', selectedProvider)
      .eq('status', 'active')
      .single();

    if (walletError || !wallet) {
      // If selected gateway not available, try other available gateways
      for (const availableGateway of gatewaySelection.availableGateways) {
        if (availableGateway === selectedProvider) continue;
        
        const { data: altWallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('photographer_id', event.photographer_id)
          .eq('provider', availableGateway)
          .eq('status', 'active')
          .single();

        if (altWallet) {
          // Use alternative gateway
          return NextResponse.json({
            error: `Preferred payment method not available. Please use ${availableGateway}.`,
            suggestedGateway: availableGateway,
            availableGateways: gatewaySelection.availableGateways,
          }, { status: 400 });
        }
      }

      return NextResponse.json(
        { 
          error: 'Creator has not set up payments for any available method',
          availableGateways: gatewaySelection.availableGateways,
        },
        { status: 400 }
      );
    }

    // Check for duplicate purchases
    if (user?.id && mediaIds && mediaIds.length > 0) {
      const { count: existingCount } = await supabase
        .from('entitlements')
        .select('id', { count: 'exact', head: true })
        .eq('attendee_id', user.id)
        .eq('event_id', eventId)
        .in('media_id', mediaIds);

      if (existingCount && existingCount > 0) {
        return NextResponse.json(
          { error: 'You have already purchased some of these photos' },
          { status: 400 }
        );
      }
    }

    if (user?.id && unlockAll) {
      const { count: unlockAllCount } = await supabase
        .from('entitlements')
        .select('id', { count: 'exact', head: true })
        .eq('attendee_id', user.id)
        .eq('event_id', eventId)
        .eq('entitlement_type', 'bulk');

      if (unlockAllCount && unlockAllCount > 0) {
        return NextResponse.json(
          { error: 'You have already purchased all photos from this event' },
          { status: 400 }
        );
      }
    }

    // Calculate gross amount in event currency
    let grossAmountInEventCurrency = 0;

    if (unlockAll) {
      if (!pricing.unlock_all_price) {
        return NextResponse.json(
          { error: 'Unlock all pricing is not set for this event' },
          { status: 400 }
        );
      }
      grossAmountInEventCurrency = pricing.unlock_all_price;
    } else if (mediaIds && mediaIds.length > 0) {
      if (pricing.pricing_type === 'bulk' && pricing.bulk_tiers) {
        grossAmountInEventCurrency = await calculateBulkPrice(eventId, mediaIds.length);
      } else {
        grossAmountInEventCurrency = (pricing.price_per_media || 0) * mediaIds.length;
      }
    } else {
      return NextResponse.json(
        { error: 'No photos selected' },
        { status: 400 }
      );
    }

    // Calculate all fees using centralized calculator (handles currency conversion)
    // Use selectedProvider for fee calculation
    const feeCalculation = await calculateFees({
      grossAmount: grossAmountInEventCurrency,
      eventCurrency,
      transactionCurrency,
      photographerId: event.photographer_id,
      eventId,
      provider: selectedProvider,
    });

    // Build items for checkout (in transaction currency)
    const items: Array<{
      name: string;
      description?: string;
      amount: number; // In transaction currency (cents)
      quantity: number;
      mediaIds?: string[];
    }> = [];

    if (unlockAll) {
      items.push({
        name: `All Photos - ${event.name}`,
        description: 'Unlock all photos from this event',
        amount: feeCalculation.grossAmount,
        quantity: 1,
      });
    } else {
      items.push({
        name: `${mediaIds.length} Photo${mediaIds.length > 1 ? 's' : ''} - ${event.name}`,
        description: `Selected photos from ${event.name}`,
        amount: feeCalculation.grossAmount,
        quantity: 1,
        mediaIds,
      });
    }

    const baseUrl = getAppUrl();
    const txRef = uuidv4();

    // Determine customer email
    const email = customerEmail || user?.email;

    // Claim idempotency slot before creating provider session/order.
    const claimTimestamp = new Date().toISOString();
    const { data: claimedIdempotency, error: claimError } = await serviceClient
      .from('api_idempotency_keys')
      .insert({
        operation_scope: idempotencyScope,
        actor_id: actorId,
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
        .eq('operation_scope', idempotencyScope)
        .eq('actor_id', actorId)
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
          { error: 'Idempotency key was already used with a different request payload' },
          { status: 409 }
        );
      }

      if (existingIdempotency.status === 'completed' && existingIdempotency.response_payload) {
        return NextResponse.json(
          existingIdempotency.response_payload as Record<string, unknown>,
          { status: existingIdempotency.response_code || 200 }
        );
      }

      if (existingIdempotency.status === 'failed' && existingIdempotency.error_payload) {
        return NextResponse.json(
          existingIdempotency.error_payload as Record<string, unknown>,
          { status: existingIdempotency.response_code || 400 }
        );
      }

      return NextResponse.json(
        { error: 'Checkout request is already being processed with this idempotency key' },
        { status: 409 }
      );
    }

    idempotencyRecordId = claimedIdempotency.id;

    let checkoutUrl: string;
    let sessionId: string;

    // Use selected provider (not the original provider parameter)
    const finalProvider = selectedProvider;

    // Handle Stripe
    if (finalProvider === 'stripe') {
      if (!isStripeConfigured() || !wallet.stripe_account_id) {
        return respond(
          { error: 'Stripe is not configured' },
          500,
          'failed'
        );
      }

      const session = await createCheckoutSession({
        photographerAccountId: wallet.stripe_account_id,
        eventId,
        eventName: event.name,
        items, // Already in transaction currency with correct amounts
        currency: transactionCurrency.toLowerCase(),
        customerEmail: email,
        platformFee: feeCalculation.platformFee, // Pass calculated platform fee
        successUrl: `${baseUrl}/gallery/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/gallery/events/${eventId}?checkout=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
          event_currency: eventCurrency,
          exchange_rate: feeCalculation.exchangeRate.toString(),
        },
      });

      checkoutUrl = session.url!;
      sessionId = session.id;
    }
    // Handle Flutterwave
    else if (finalProvider === 'flutterwave') {
      if (!isFlutterwaveConfigured() || !wallet.flutterwave_subaccount_id) {
        return respond(
          { error: 'Flutterwave is not configured' },
          500,
          'failed'
        );
      }

      const payment = await initializePayment({
        txRef,
        amount: feeCalculation.grossAmount,
        currency: transactionCurrency.toLowerCase(),
        redirectUrl: `${baseUrl}/gallery/checkout/success?tx_ref=${txRef}&provider=flutterwave`,
        customerEmail: email || '',
        eventId,
        eventName: event.name,
        photographerId: event.photographer_id,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
        },
      });

      checkoutUrl = payment.link;
      sessionId = txRef;
    }
    // Handle PayPal
    else if (finalProvider === 'paypal') {
      if (!isPayPalConfigured() || !wallet.paypal_merchant_id) {
        return respond(
          { error: 'PayPal is not configured' },
          500,
          'failed'
        );
      }

      const order = await createOrder({
        eventId,
        eventName: event.name,
        items,
        currency: transactionCurrency.toLowerCase(),
        photographerPayPalEmail: wallet.paypal_merchant_id,
        returnUrl: `${baseUrl}/gallery/checkout/success?order_id=${txRef}&provider=paypal`,
        cancelUrl: `${baseUrl}/gallery/events/${eventId}?checkout=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
          tx_ref: txRef,
        },
      });

      const approvalUrl = getApprovalUrl(order);
      if (!approvalUrl) {
        return respond(
          { error: 'Failed to get PayPal approval URL' },
          500,
          'failed'
        );
      }

      checkoutUrl = approvalUrl;
      sessionId = order.id;
    } else {
      return respond(
        { error: 'Invalid payment provider' },
        400,
        'failed'
      );
    }

    // Validate media IDs are not already purchased (prevent double purchase)
    if (mediaIds && mediaIds.length > 0 && user?.id) {
      const { data: existingEntitlements } = await supabase
        .from('entitlements')
        .select('media_id')
        .eq('attendee_id', user.id)
        .in('media_id', mediaIds)
        .eq('event_id', eventId);

      if (existingEntitlements && existingEntitlements.length > 0) {
        const alreadyOwned = existingEntitlements.map((e: any) => e.media_id);
        return respond(
          { 
            error: 'Some photos have already been purchased',
            alreadyOwned,
          },
          400,
          'failed'
        );
      }
    }

    // Create pending transaction record with proper fee calculation and idempotency
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        event_id: eventId,
        wallet_id: wallet.id,
        attendee_id: user?.id || null,
        attendee_email: email,
        payment_provider: finalProvider,
        stripe_payment_intent_id: finalProvider === 'stripe' ? null : null, // Will be filled by webhook
        stripe_checkout_session_id: finalProvider === 'stripe' ? sessionId : null,
        flutterwave_tx_ref: finalProvider === 'flutterwave' ? txRef : null,
        paypal_order_id: finalProvider === 'paypal' ? sessionId : null,
        gross_amount: feeCalculation.grossAmount,
        original_amount: feeCalculation.originalAmount,
        platform_fee: feeCalculation.platformFee,
        transaction_fee: feeCalculation.transactionFee, // Region-based transaction fee
        stripe_fee: feeCalculation.providerFee, // Provider fee (Stripe/Flutterwave/PayPal)
        provider_fee: feeCalculation.providerFee,
        net_amount: feeCalculation.netAmount,
        currency: transactionCurrency,
        event_currency: eventCurrency,
        exchange_rate: feeCalculation.exchangeRate,
        status: 'pending',
        metadata: {
          items,
          media_ids: mediaIds || [],
          unlock_all: unlockAll || false,
          fee_breakdown: feeCalculation.breakdown,
          photographer_plan: subscription.plan_code,
          idempotency_key: idempotencyKey, // Store idempotency key in metadata
          created_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (transactionError) {
      // Check if it's a duplicate key error (idempotency violation)
      if (transactionError.code === '23505') {
        // Unique constraint violation - transaction already exists
        const { data: existing } = await supabase
          .from('transactions')
          .select('*')
          .eq('event_id', eventId)
          .eq('attendee_id', user?.id || null)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing && existing.metadata?.checkoutUrl) {
          const duplicatePayload = {
            checkoutUrl: existing.metadata.checkoutUrl,
            sessionId: existing.id,
            provider: existing.payment_provider || finalProvider,
            message: 'Using existing checkout session',
          };
          return respond(duplicatePayload, 200, 'completed', existing.id);
        }
      }
      throw transactionError;
    }

    // Store checkout URL in transaction metadata for idempotency
    await supabase
      .from('transactions')
      .update({
        metadata: {
          ...transaction.metadata,
          checkoutUrl,
        },
      })
      .eq('id', transaction.id);

    const successPayload = {
      checkoutUrl,
      sessionId,
      provider: finalProvider,
      gatewaySelection: {
        reason: gatewaySelection.reason,
        availableGateways: gatewaySelection.availableGateways,
      },
    };

    return respond(successPayload, 200, 'completed', transaction.id);
  } catch (error) {
    console.error('Checkout error:', error);
    const errorPayload = { error: error instanceof Error ? error.message : 'Checkout failed' };
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', 500, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: 500 });
  }
}

