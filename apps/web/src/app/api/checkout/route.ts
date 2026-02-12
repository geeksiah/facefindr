export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { getEffectiveCurrency } from '@/lib/currency/currency-service';
import { calculateFees, calculateBulkPrice } from '@/lib/payments/fee-calculator';
import {
  initializePayment,
  isFlutterwaveConfigured,
} from '@/lib/payments/flutterwave';
import { selectPaymentGateway } from '@/lib/payments/gateway-selector';
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
import { createClient } from '@/lib/supabase/server';

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

  try {
    const supabase = await createClient();
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
      idempotencyKey, // Client-generated unique key to prevent duplicate submissions
    } = body;

    // Validate idempotency key
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency key is required' },
        { status: 400 }
      );
    }

    // Check for existing transaction with same idempotency key (prevent double submission)
    // Check in metadata since idempotency_key might be stored there
    const { data: existingTransactions } = await supabase
      .from('transactions')
      .select('id, status, metadata')
      .eq('event_id', eventId)
      .eq('attendee_id', user?.id || '')
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
      .order('created_at', { ascending: false })
      .limit(5);

    // Check if any transaction has the same idempotency key in metadata
    const existingTransaction = existingTransactions?.find(
      (t: any) => t.metadata?.idempotency_key === idempotencyKey
    );

    if (existingTransaction) {
      // Return existing transaction if already processed
      if (existingTransaction.status === 'succeeded') {
        return NextResponse.json(
          { error: 'This transaction has already been completed' },
          { status: 409 }
        );
      }
      // Return existing checkout URL if still pending
      if (existingTransaction.metadata?.checkoutUrl) {
        return NextResponse.json({
          checkoutUrl: existingTransaction.metadata.checkoutUrl,
          sessionId: existingTransaction.id,
          provider: existingTransaction.payment_provider || provider,
          message: 'Using existing checkout session',
        });
      }
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
        { error: 'Photographer must have an active subscription to accept payments' },
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
    const gatewaySelection = await selectPaymentGateway({
      userId: user?.id || '',
      photographerId: event.photographer_id,
      currency: transactionCurrency,
      countryCode: event.country_code || undefined,
    });

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
          error: 'Photographer has not set up payments for any available method',
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const txRef = uuidv4();

    // Determine customer email
    const email = customerEmail || user?.email;

    let checkoutUrl: string;
    let sessionId: string;

    // Use selected provider (not the original provider parameter)
    const finalProvider = selectedProvider;

    // Handle Stripe
    if (finalProvider === 'stripe') {
      if (!isStripeConfigured() || !wallet.stripe_account_id) {
        return NextResponse.json(
          { error: 'Stripe is not configured' },
          { status: 500 }
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
        return NextResponse.json(
          { error: 'Flutterwave is not configured' },
          { status: 500 }
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
        return NextResponse.json(
          { error: 'PayPal is not configured' },
          { status: 500 }
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
        return NextResponse.json(
          { error: 'Failed to get PayPal approval URL' },
          { status: 500 }
        );
      }

      checkoutUrl = approvalUrl;
      sessionId = order.id;
    } else {
      return NextResponse.json(
        { error: 'Invalid payment provider' },
        { status: 400 }
      );
    }

    // Additional security: Check for duplicate pending transactions for same user/event/media
    if (user?.id) {
      const { data: duplicatePending } = await supabase
        .from('transactions')
        .select('id')
        .eq('event_id', eventId)
        .eq('attendee_id', user.id)
        .eq('status', 'pending')
        .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
        .single();

      if (duplicatePending) {
        return NextResponse.json(
          { error: 'A pending transaction already exists. Please wait for it to complete.' },
          { status: 409 }
        );
      }
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
        return NextResponse.json(
          { 
            error: 'Some photos have already been purchased',
            alreadyOwned,
          },
          { status: 400 }
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
        stripe_payment_intent_id: provider === 'stripe' ? null : null, // Will be filled by webhook
        stripe_checkout_session_id: provider === 'stripe' ? sessionId : null,
        flutterwave_tx_ref: provider === 'flutterwave' ? txRef : null,
        paypal_order_id: provider === 'paypal' ? sessionId : null,
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
          .single();

        if (existing && existing.metadata?.checkoutUrl) {
          return NextResponse.json({
            checkoutUrl: existing.metadata.checkoutUrl,
            sessionId: existing.id,
            provider,
            message: 'Using existing checkout session',
          });
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

    return NextResponse.json({
      checkoutUrl,
      sessionId,
      provider: finalProvider,
      gatewaySelection: {
        reason: gatewaySelection.reason,
        availableGateways: gatewaySelection.availableGateways,
      },
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}

