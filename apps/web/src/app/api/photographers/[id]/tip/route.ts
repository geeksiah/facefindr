export const dynamic = 'force-dynamic';

/**
 * Tip Creator API
 * 
 * Handle tips to photographers (after photo purchase/download)
 * Uses dynamic payment gateway selection based on user preference and country
 */

import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { getCountryFromRequest, getEffectiveCurrency, getPlatformBaseCurrency } from '@/lib/currency/currency-service';
import { calculateFees } from '@/lib/payments/fee-calculator';
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
  initializePaystackPayment,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import {
  createCheckoutSession,
  isStripeConfigured,
} from '@/lib/payments/stripe';
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

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

async function resolvePhotographerByIdentifier(supabase: any, identifier: string) {
  const normalizedIdentifier = typeof identifier === 'string' ? identifier.trim() : '';
  const faceTag = normalizedIdentifier.startsWith('@')
    ? normalizedIdentifier
    : `@${normalizedIdentifier}`;

  const withUserId = await supabase
    .from('photographers')
    .select('id, user_id, display_name, country_code')
    .or(
      `id.eq.${normalizedIdentifier},user_id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  const fallback = await supabase
    .from('photographers')
    .select('id, display_name, country_code')
    .or(
      `id.eq.${normalizedIdentifier},public_profile_slug.eq.${normalizedIdentifier},face_tag.eq.${faceTag}`
    )
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, user_id: fallback.data.id } : fallback.data,
    error: fallback.error,
  };
}

async function resolveLedgerEventIdForTip(
  supabase: ReturnType<typeof createServiceClient>,
  photographerId: string,
  explicitEventId?: string | null
): Promise<string | null> {
  if (explicitEventId) {
    return explicitEventId;
  }

  const { data: fallbackEvent } = await supabase
    .from('events')
    .select('id')
    .eq('photographer_id', photographerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallbackEvent?.id || null;
}


// POST - Create tip payment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const { id: photographerIdentifier } = params;
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      amount, 
      currency: providedCurrency, 
      provider, // Optional: specific provider preference
      eventId, 
      mediaId, 
      message, 
      isAnonymous = false,
      idempotencyKey: bodyIdempotencyKey,
    } = body;
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

    const normalizedProvidedCurrency =
      typeof providedCurrency === 'string' && providedCurrency.trim()
        ? providedCurrency.trim().toUpperCase()
        : undefined;
    const detectedCountry = getCountryFromRequest(request.headers);

    // Validate amount (minimum $2.00 = 200 cents)
    if (!amount || amount < 200) {
      return NextResponse.json(
        { error: 'Minimum tip amount is 2.00 (in selected currency)' },
        { status: 400 }
      );
    }

    const operationScope = 'tip.create';
    const requestHash = buildRequestHash({
      actorId: user.id,
      photographerId: photographerIdentifier,
      amount,
      currency: normalizedProvidedCurrency || null,
      provider: provider || null,
      eventId: eventId || null,
      mediaId: mediaId || null,
      message: message || null,
      isAnonymous: Boolean(isAnonymous),
    });
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

    const { data: photographer } = await resolvePhotographerByIdentifier(
      serviceClient,
      photographerIdentifier
    );

    if (!photographer) {
      return respond({ error: 'Creator not found' }, 404, 'failed');
    }
    const photographerId = photographer.id;
    const photographerUserId = (photographer as any).user_id || photographer.id;

    if (photographerUserId === user.id) {
      return respond(
        { error: 'You cannot tip your own profile' },
        400,
        'failed'
      );
    }

    // Get event info if provided (for currency and country detection)
    let eventCurrency = await getPlatformBaseCurrency();
    let eventCountryCode: string | undefined;
    
    if (eventId) {
      const { data: event } = await serviceClient
        .from('events')
        .select('currency_code, country_code')
        .eq('id', eventId)
        .single();
      
      if (event) {
        eventCurrency = event.currency_code || 'USD';
        eventCountryCode = event.country_code || undefined;
      }
    }

    // Determine transaction currency (use provided, user preference, or event currency)
    const transactionCurrency = normalizedProvidedCurrency || 
      await getEffectiveCurrency(user.id, eventCountryCode || photographer.country_code || detectedCountry || undefined) || 
      eventCurrency;

    // Select payment gateway based on user preference, country, and availability
    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user.id,
        photographerId: photographerId,
        currency: transactionCurrency,
        countryCode: eventCountryCode || photographer.country_code || detectedCountry || undefined,
        productType: 'tip',
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

    // Use selected gateway (or override with provided provider if valid)
    const selectedProvider = provider && gatewaySelection.availableGateways.includes(provider as any)
      ? provider
      : gatewaySelection.gateway;

    // Get photographer's wallet for selected provider
    const { data: wallet, error: walletError } = await serviceClient
      .from('wallets')
      .select('*')
      .eq('photographer_id', photographerId)
      .eq('provider', selectedProvider)
      .eq('status', 'active')
      .single();

    if (walletError || !wallet) {
      // If selected gateway not available, try other available gateways
      for (const availableGateway of gatewaySelection.availableGateways) {
        if (availableGateway === selectedProvider) continue;
        
        const { data: altWallet } = await serviceClient
          .from('wallets')
          .select('*')
          .eq('photographer_id', photographerId)
          .eq('provider', availableGateway)
          .eq('status', 'active')
          .single();

        if (altWallet) {
          return respond({
            error: `Preferred payment method not available. Please use ${availableGateway}.`,
            suggestedGateway: availableGateway,
            availableGateways: gatewaySelection.availableGateways,
          }, 400, 'failed');
        }
      }

      return respond(
        { 
          error: 'Creator has not set up payments for any available method',
          availableGateways: gatewaySelection.availableGateways,
        },
        400,
        'failed'
      );
    }

    // Create tip record
    const { data: tip, error: tipError } = await serviceClient
      .from('tips')
      .insert({
        from_user_id: user.id,
        to_photographer_id: photographerId,
        event_id: eventId || null,
        media_id: mediaId || null,
        amount,
        currency: transactionCurrency,
        message: message || null,
        is_anonymous: isAnonymous,
        status: 'pending',
      })
      .select()
      .single();

    if (tipError) {
      throw tipError;
    }

    try {
      await serviceClient.from('audit_logs').insert({
        actor_type: 'attendee',
        actor_id: user.id,
        action: 'tip_created',
        resource_type: 'tip',
        resource_id: tip.id,
        metadata: {
          to_photographer_id: photographerId,
          amount,
          currency: transactionCurrency,
          event_id: eventId || null,
          media_id: mediaId || null,
          is_anonymous: isAnonymous,
        },
        ip_address:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          null,
      });
    } catch {
      // Non-blocking audit trail.
    }

    // Calculate fees using centralized calculator (10% platform fee for tips)
    // Note: For tips, we always use 10% platform fee regardless of photographer plan
    const feeCalculation = await calculateFees({
      grossAmount: amount,
      eventCurrency: eventCurrency,
      transactionCurrency: transactionCurrency,
      photographerId: photographerId,
      eventId: eventId || photographerId, // Use photographer ID as fallback
      provider: selectedProvider,
    });

    // Override platform fee to 10% for tips
    const tipPlatformFee = Math.round(amount * 0.10);
    const adjustedFeeCalculation = {
      ...feeCalculation,
      platformFee: tipPlatformFee,
      netAmount: amount - tipPlatformFee - feeCalculation.providerFee,
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const txRef = uuidv4();

    let checkoutUrl: string;
    let sessionId: string;

    // Handle Stripe
    if (selectedProvider === 'stripe') {
      if (!isStripeConfigured() || !wallet.stripe_account_id) {
        return respond(
          { error: 'Stripe is not configured' },
          500,
          'failed'
        );
      }

      // Check if user has saved payment methods (via Stripe customer ID)
      // For now, use customer_email which Stripe will use to match existing customers
      // and show saved payment methods in Checkout
      
      const session = await createCheckoutSession({
        photographerAccountId: wallet.stripe_account_id,
        eventId: eventId || photographerId,
        eventName: `Tip to ${photographer.display_name}`,
        items: [{
          name: `Tip to ${photographer.display_name}`,
          description: message || 'Thank you for your amazing photos!',
          amount: amount,
          quantity: 1,
        }],
        currency: transactionCurrency.toLowerCase(),
        customerEmail: user.email, // Stripe will match existing customer and show saved payment methods
        platformFee: adjustedFeeCalculation.platformFee,
        successUrl: `${baseUrl}/gallery/checkout/success?tip_id=${tip.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: eventId 
          ? `${baseUrl}/gallery/events/${eventId}?tip=cancelled`
          : `${baseUrl}/gallery?tip=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          tip_id: tip.id,
          photographer_id: photographerId,
          from_user_id: user.id,
          event_id: eventId || '',
          media_id: mediaId || '',
          is_anonymous: String(isAnonymous),
        },
      });

      checkoutUrl = session.url!;
      sessionId = session.id;
    }
    // Handle Flutterwave
    else if (selectedProvider === 'flutterwave') {
      if (!isFlutterwaveConfigured() || !wallet.flutterwave_subaccount_id) {
        return respond(
          { error: 'Flutterwave is not configured' },
          500,
          'failed'
        );
      }

      const payment = await initializePayment({
        txRef,
        amount: amount,
        currency: transactionCurrency,
        redirectUrl: `${baseUrl}/gallery/checkout/success?tip_id=${tip.id}&tx_ref=${txRef}&provider=flutterwave`,
        customerEmail: user.email || '',
        eventId: eventId || photographerId,
        eventName: `Tip to ${photographer.display_name}`,
        photographerId,
        metadata: {
          wallet_id: wallet.id,
          tip_id: tip.id,
          photographer_id: photographerId,
          from_user_id: user.id,
          event_id: eventId || '',
          media_id: mediaId || '',
          is_anonymous: String(isAnonymous),
        },
      });

      checkoutUrl = payment.link;
      sessionId = txRef;
    }
    // Handle PayPal
    else if (selectedProvider === 'paypal') {
      if (!isPayPalConfigured() || !wallet.paypal_merchant_id) {
        return respond(
          { error: 'PayPal is not configured' },
          500,
          'failed'
        );
      }

      const order = await createOrder({
        eventId: eventId || photographerId,
        eventName: `Tip to ${photographer.display_name}`,
        items: [{
          name: `Tip to ${photographer.display_name}`,
          description: message || 'Thank you for your amazing photos!',
          amount: amount,
          quantity: 1,
        }],
        currency: transactionCurrency,
        photographerPayPalEmail: wallet.paypal_merchant_id,
        returnUrl: `${baseUrl}/gallery/checkout/success?tip_id=${tip.id}&order_id=${txRef}&provider=paypal`,
        cancelUrl: eventId 
          ? `${baseUrl}/gallery/events/${eventId}?tip=cancelled`
          : `${baseUrl}/gallery?tip=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          tip_id: tip.id,
          photographer_id: photographerId,
          from_user_id: user.id,
          event_id: eventId || '',
          media_id: mediaId || '',
          is_anonymous: String(isAnonymous),
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
    } else if (selectedProvider === 'paystack') {
      const paystackSecretKey = await resolvePaystackSecretKey(eventCountryCode || photographer.country_code || undefined);
      if (!paystackSecretKey) {
        return respond(
          { error: 'Paystack is not configured' },
          500,
          'failed'
        );
      }

      const payment = await initializePaystackPayment({
        reference: txRef,
        email: user.email || '',
        amount,
        currency: transactionCurrency,
        callbackUrl: `${baseUrl}/gallery/checkout/success?tip_id=${tip.id}&reference=${txRef}&provider=paystack`,
        metadata: {
          wallet_id: wallet.id,
          tip_id: tip.id,
          photographer_id: photographerId,
          from_user_id: user.id,
          event_id: eventId || '',
          media_id: mediaId || '',
          is_anonymous: isAnonymous,
        },
        subaccount: (wallet as any).paystack_subaccount_code || undefined,
      }, paystackSecretKey);

      checkoutUrl = payment.authorizationUrl;
      sessionId = payment.reference;
    } else {
      return respond(
        { error: 'Invalid payment provider' },
        400,
        'failed'
      );
    }

    const ledgerEventId = await resolveLedgerEventIdForTip(serviceClient, photographerId, eventId || null);
    if (ledgerEventId) {
      const transactionPayload: Record<string, any> = {
        event_id: ledgerEventId,
        wallet_id: wallet.id,
        attendee_id: user.id,
        attendee_email: user.email || null,
        gross_amount: amount,
        platform_fee: adjustedFeeCalculation.platformFee,
        stripe_fee: adjustedFeeCalculation.providerFee,
        provider_fee: adjustedFeeCalculation.providerFee,
        net_amount: adjustedFeeCalculation.netAmount,
        currency: transactionCurrency,
        status: 'pending',
        payment_provider: selectedProvider,
        metadata: {
          type: 'tip',
          tip_id: tip.id,
          photographer_id: photographerId,
          from_user_id: user.id,
          event_id: eventId || null,
          media_id: mediaId || null,
          message: message || null,
          is_anonymous: isAnonymous,
        },
      };

      if (selectedProvider === 'stripe') {
        transactionPayload.stripe_checkout_session_id = sessionId;
        transactionPayload.stripe_payment_intent_id = txRef;
      } else if (selectedProvider === 'flutterwave') {
        transactionPayload.flutterwave_tx_ref = sessionId;
      } else if (selectedProvider === 'paypal') {
        transactionPayload.paypal_order_id = sessionId;
      } else if (selectedProvider === 'paystack') {
        transactionPayload.paystack_reference = sessionId;
      }

      const { error: transactionError } = await serviceClient
        .from('transactions')
        .insert(transactionPayload);

      if (transactionError) {
        console.error('Failed to create tip transaction ledger row:', transactionError);
      }
    } else {
      console.warn('Tip ledger event could not be resolved; transaction trace skipped', {
        tipId: tip.id,
        photographerId,
      });
    }

    // Update tip with payment session ID
    const paymentField = selectedProvider === 'stripe' 
      ? 'stripe_payment_intent_id' 
      : selectedProvider === 'flutterwave'
      ? 'stripe_payment_intent_id' // Reuse field for Flutterwave tx_ref
      : 'stripe_payment_intent_id'; // Reuse field for PayPal order ID
    
    await serviceClient
      .from('tips')
      .update({ 
        [paymentField]: sessionId,
        currency: transactionCurrency,
      })
      .eq('id', tip.id);

    return respond({
      tipId: tip.id,
      checkoutUrl,
      sessionId,
      provider: selectedProvider,
      amount,
      currency: transactionCurrency,
      gatewaySelection: {
        reason: gatewaySelection.reason,
        availableGateways: gatewaySelection.availableGateways,
      },
    }, 200, 'completed');

  } catch (error: any) {
    console.error('Create tip error:', error);
    const errorPayload = { error: error?.message || 'Failed to create tip' };
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', 500, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: 500, headers: responseHeaders });
  }
}

// GET - Get tip stats for a photographer (they can view their received tips)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: photographerIdentifier } = params;
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: photographer } = await resolvePhotographerByIdentifier(
      serviceClient,
      photographerIdentifier
    );

    if (!photographer) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }
    const photographerId = photographer.id;
    const photographerUserId = (photographer as any).user_id || photographer.id;

    // Only photographer owner can view their own tips
    if (user.id !== photographerUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: tips, error } = await serviceClient
      .from('tips')
      .select(`
        id,
        amount,
        currency,
        status,
        message,
        is_anonymous,
        created_at,
        event_id,
        media_id,
        from_user_id
      `)
      .eq('to_photographer_id', photographerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    // Calculate stats
    const totalTips = tips?.reduce((sum, tip) => sum + tip.amount, 0) || 0;
    const completedTips = tips?.filter((t) => t.status === 'completed') || [];
    const totalCompleted = completedTips.reduce((sum, tip) => sum + tip.amount, 0);

    return NextResponse.json({
      tips: tips || [],
      stats: {
        totalCount: tips?.length || 0,
        totalAmount: totalTips,
        completedCount: completedTips.length,
        completedAmount: totalCompleted,
      },
    });

  } catch (error: any) {
    console.error('Get tips error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to get tips' },
      { status: 500 }
    );
  }
}

