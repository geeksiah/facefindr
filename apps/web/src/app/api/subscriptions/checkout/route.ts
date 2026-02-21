export const dynamic = 'force-dynamic';

/**
 * Subscription Checkout API
 * 
 * Create checkout session for subscription upgrade.
 */

import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency';
import { getAppUrl } from '@/lib/env';
import {
  isFlutterwaveConfigured,
  initializeRecurringPayment,
} from '@/lib/payments/flutterwave';
import { GatewaySelectionError, selectPaymentGateway } from '@/lib/payments/gateway-selector';
import {
  isPayPalConfigured,
  createBillingSubscription,
  getApprovalUrl,
} from '@/lib/payments/paypal';
import {
  initializePaystackSubscription,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import {
  resolveProviderPlanMapping,
} from '@/lib/payments/recurring-subscriptions';
import { stripe } from '@/lib/payments/stripe';
import { getPlanByCode } from '@/lib/subscription';
import { resolvePlanPriceForCurrency } from '@/lib/subscription/price-resolution';
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

export async function POST(request: NextRequest) {
  let idempotencyFinalizeRef:
    | ((
        status: 'completed' | 'failed',
        responseCode: number,
        payload: Record<string, unknown>
      ) => Promise<void>)
    | null = null;
  let responseHeaders: HeadersInit = {};

  try {
    const appUrl = getAppUrl();

    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      planCode,
      billingCycle = 'monthly',
      currency: requestedCurrency,
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

    if (!planCode || planCode === 'free') {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      return NextResponse.json(
        { error: 'Invalid billing cycle' },
        { status: 400 }
      );
    }

    const operationScope = 'subscription.checkout.create';
    const requestHash = buildRequestHash({
      planCode,
      billingCycle,
      currency: requestedCurrency || null,
      actorId: user.id,
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
          error: 'Checkout request is already being processed with this idempotency key',
          idempotencyKey,
          replayed: false,
        },
        { status: 409, headers: responseHeaders }
      );
    }

    idempotencyRecordId = claimedIdempotency.id;

    // Fail-closed to admin-managed plan configuration
    const plan = await getPlanByCode(planCode, 'creator');
    if (!plan || !plan.isActive || plan.planType !== 'creator') {
      return respond(
        { error: 'Plan is not available for creator subscriptions', failClosed: true },
        503,
        'failed'
      );
    }

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const fallbackCurrency = await getEffectiveCurrency(user.id, detectedCountry);
    const normalizedCurrency = String(requestedCurrency || fallbackCurrency || 'USD').toUpperCase();

    // Select payment gateway based on user preference
    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user.id,
        currency: normalizedCurrency.toLowerCase(),
        productType: 'subscription',
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

    const configuredGateways = Array.from(
      new Set([gatewaySelection.gateway, ...(gatewaySelection.availableGateways || [])])
    );
    let selectedGateway = gatewaySelection.gateway;
    let mapping = await resolveProviderPlanMapping({
      productScope: 'creator_subscription',
      internalPlanCode: plan.code,
      provider: selectedGateway,
      billingCycle,
      currency: normalizedCurrency,
      regionCode: gatewaySelection.countryCode,
    });

    // Mapping fallback strategy:
    // - If selected gateway has no mapping, try alternative configured gateways.
    // - Stripe can operate without a provider-plan mapping using dynamic recurring price_data.
    if (!mapping) {
      for (const candidate of configuredGateways) {
        if (candidate === selectedGateway) continue;

        const candidateMapping = await resolveProviderPlanMapping({
          productScope: 'creator_subscription',
          internalPlanCode: plan.code,
          provider: candidate,
          billingCycle,
          currency: normalizedCurrency,
          regionCode: gatewaySelection.countryCode,
        });
        if (candidateMapping) {
          mapping = candidateMapping;
          selectedGateway = candidate;
          break;
        }

        if (candidate === 'stripe' && stripe) {
          selectedGateway = 'stripe';
        }
      }
    }

    if (!mapping && selectedGateway !== 'stripe') {
      return respond(
        {
          error: `Recurring mapping missing for available gateways (${configuredGateways.join(', ')}) on ${plan.code}/${billingCycle}/${normalizedCurrency}`,
          failClosed: true,
          code: 'missing_provider_plan_mapping',
        },
        503,
        'failed'
      );
    }

    const checkoutCurrency = String(mapping?.currency || normalizedCurrency).toUpperCase();
    const resolvedPrice = await resolvePlanPriceForCurrency(plan, checkoutCurrency);
    const checkoutAmountInCents = Number(resolvedPrice?.amountCents || 0);
    if (!Number.isFinite(checkoutAmountInCents) || checkoutAmountInCents <= 0) {
      return respond(
        {
          error: `Plan pricing is not configured for ${checkoutCurrency}`,
          failClosed: true,
        },
        503,
        'failed'
      );
    }

    // Handle Stripe
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return respond(
          { error: 'Stripe not configured' },
          500,
          'failed'
        );
      }

      // Get or create Stripe customer
      const { data: photographer } = await supabase
        .from('photographers')
        .select('stripe_customer_id, email')
        .eq('id', user.id)
        .single();

      let customerId = photographer?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            photographer_id: user.id,
          },
        });

        customerId = customer.id;

        await supabase
          .from('photographers')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      }

      const lineItems: any[] = [];
      if (mapping?.provider_plan_id?.startsWith('price_')) {
        lineItems.push({
          price: mapping.provider_plan_id,
          quantity: 1,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency.toLowerCase(),
            unit_amount: Math.round(checkoutAmountInCents),
            recurring: {
              interval: billingCycle === 'annual' ? 'year' : 'month',
            },
            product_data: {
              name: plan.name,
              description: plan.description || `${plan.name} subscription`,
              metadata: {
                plan_id: plan.id,
                plan_code: plan.code,
                plan_type: plan.planType,
              },
            },
          },
          quantity: 1,
        });
      }
      const buildSessionPayload = (pricingCurrency: string, amountCents: number) => ({
        customer: customerId,
        mode: 'subscription' as const,
        line_items: mapping?.provider_plan_id?.startsWith('price_')
          ? (lineItems as any)
          : ([
              {
                price_data: {
                  currency: pricingCurrency.toLowerCase(),
                  unit_amount: Math.round(amountCents),
                  recurring: {
                    interval: billingCycle === 'annual' ? 'year' : 'month',
                  },
                  product_data: {
                    name: plan.name,
                    description: plan.description || `${plan.name} subscription`,
                    metadata: {
                      plan_id: plan.id,
                      plan_code: plan.code,
                      plan_type: plan.planType,
                    },
                  },
                },
                quantity: 1,
              },
            ] as any),
        success_url: `${appUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
        subscription_data: {
          metadata: {
            photographer_id: user.id,
            subscription_scope: 'creator_subscription',
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: pricingCurrency,
            pricing_amount_cents: String(Math.round(amountCents)),
            provider_plan_id: mapping?.provider_plan_id || 'dynamic',
          },
        },
        metadata: {
          photographer_id: user.id,
          subscription_scope: 'creator_subscription',
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: pricingCurrency,
          pricing_amount_cents: String(Math.round(amountCents)),
          provider_plan_id: mapping?.provider_plan_id || 'dynamic',
        },
      });

      let session;
      let effectiveStripeCurrency = checkoutCurrency;
      let effectiveStripeAmount = Math.round(checkoutAmountInCents);

      try {
        session = await stripe.checkout.sessions.create(
          buildSessionPayload(checkoutCurrency, checkoutAmountInCents)
        );
      } catch (stripeError) {
        const resolvedUsd = await resolvePlanPriceForCurrency(plan, 'USD');
        const usdAmount = Number(resolvedUsd?.amountCents || 0);
        const shouldRetryInUsd =
          !mapping &&
          checkoutCurrency !== 'USD' &&
          Number.isFinite(usdAmount) &&
          usdAmount > 0;

        if (!shouldRetryInUsd) {
          throw stripeError;
        }

        session = await stripe.checkout.sessions.create(buildSessionPayload('USD', usdAmount));
        effectiveStripeCurrency = 'USD';
        effectiveStripeAmount = Math.round(usdAmount);
      }

      return respond({
        checkoutUrl: session.url,
        sessionId: session.id,
        gateway: selectedGateway,
        pricingCurrency: effectiveStripeCurrency,
        pricingAmountCents: effectiveStripeAmount,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'paypal') {
      if (!mapping) {
        return respond(
          { error: 'Recurring mapping missing for PayPal plan', code: 'missing_provider_plan_mapping' },
          503,
          'failed'
        );
      }
      if (!isPayPalConfigured()) {
        return respond({ error: 'PayPal is not configured' }, 500, 'failed');
      }

      const customPayload = JSON.stringify({
        subscription_scope: 'creator_subscription',
        photographer_id: user.id,
        plan_code: plan.code,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        pricing_currency: checkoutCurrency,
        pricing_amount_cents: Math.round(checkoutAmountInCents),
      });

      const subscription = await createBillingSubscription({
        planId: mapping.provider_plan_id,
        returnUrl: `${appUrl}/dashboard/billing?success=true&provider=paypal&subscription_id={subscription_id}`,
        cancelUrl: `${appUrl}/dashboard/billing?canceled=true&provider=paypal`,
        customId: customPayload,
        subscriber: {
          email: user.email || undefined,
        },
      });

      const approvalUrl = getApprovalUrl(subscription as any);
      if (!approvalUrl) {
        return respond(
          { error: 'Failed to create PayPal approval URL' },
          500,
          'failed'
        );
      }

      return respond({
        checkoutUrl: approvalUrl,
        sessionId: subscription.id,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'flutterwave') {
      if (!mapping) {
        return respond(
          { error: 'Recurring mapping missing for Flutterwave plan', code: 'missing_provider_plan_mapping' },
          503,
          'failed'
        );
      }
      if (!isFlutterwaveConfigured()) {
        return respond({ error: 'Flutterwave is not configured' }, 500, 'failed');
      }

      const txRef = `sub_${user.id}_${Date.now()}`;
      const payment = await initializeRecurringPayment({
        txRef,
        amount: Math.round(checkoutAmountInCents),
        currency: checkoutCurrency,
        redirectUrl: `${appUrl}/dashboard/billing?success=true&provider=flutterwave&tx_ref=${encodeURIComponent(txRef)}`,
        customerEmail: user.email || '',
        paymentPlanId: mapping.provider_plan_id,
        metadata: {
          subscription_scope: 'creator_subscription',
          photographer_id: user.id,
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: checkoutCurrency,
          pricing_amount_cents: String(Math.round(checkoutAmountInCents)),
        },
      });

      return respond({
        checkoutUrl: payment.link,
        sessionId: txRef,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'paystack') {
      if (!mapping) {
        return respond(
          { error: 'Recurring mapping missing for Paystack plan', code: 'missing_provider_plan_mapping' },
          503,
          'failed'
        );
      }
      const paystackSecretKey = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      if (!paystackSecretKey) {
        return respond({ error: 'Paystack is not configured' }, 500, 'failed');
      }

      const reference = `sub_${user.id}_${Date.now()}`;
      const payment = await initializePaystackSubscription(
        {
          reference,
          email: user.email || '',
          amount: Math.round(checkoutAmountInCents),
          currency: checkoutCurrency,
          callbackUrl: `${appUrl}/dashboard/billing?success=true&provider=paystack&reference=${encodeURIComponent(reference)}`,
          plan: mapping.provider_plan_id,
          metadata: {
            subscription_scope: 'creator_subscription',
            photographer_id: user.id,
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: checkoutCurrency,
            pricing_amount_cents: Math.round(checkoutAmountInCents),
          },
        },
        paystackSecretKey
      );

      return respond({
        checkoutUrl: payment.authorizationUrl,
        sessionId: payment.reference,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    return respond(
      {
        error: `Unsupported subscription gateway: ${selectedGateway}`,
        failClosed: true,
      },
      503,
      'failed'
    );

  } catch (error) {
    console.error('Subscription checkout error:', error);
    const errorPayload = {
      error:
        error instanceof Error && error.message
          ? error.message
          : 'Failed to create checkout session',
    };
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', 500, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: 500, headers: responseHeaders });
  }
}

