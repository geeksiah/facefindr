export const dynamic = 'force-dynamic';

/**
 * Subscription Checkout API
 * 
 * Create checkout session for subscription upgrade.
 */

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
  resolveProviderPlanMapping,
} from '@/lib/payments/recurring-subscriptions';
import {
  initializePaystackSubscription,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import { stripe } from '@/lib/payments/stripe';
import { getPlanByCode } from '@/lib/subscription';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const appUrl = getAppUrl();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planCode, billingCycle = 'monthly', currency: requestedCurrency } = body;

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

    // Fail-closed to admin-managed plan configuration
    const plan = await getPlanByCode(planCode, 'creator');
    if (!plan || !plan.isActive || plan.planType !== 'creator') {
      return NextResponse.json(
        { error: 'Plan is not available for creator subscriptions', failClosed: true },
        { status: 503 }
      );
    }

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const fallbackCurrency = await getEffectiveCurrency(user.id, detectedCountry);
    const normalizedCurrency = String(requestedCurrency || fallbackCurrency || 'USD').toUpperCase();
    const amountInCents =
      plan.prices?.[normalizedCurrency] ??
      plan.prices?.USD ??
      plan.basePriceUsd;

    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return NextResponse.json(
        { error: 'Plan pricing is not configured', failClosed: true },
        { status: 503 }
      );
    }

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

    const selectedGateway = gatewaySelection.gateway;

    const mapping = await resolveProviderPlanMapping({
      productScope: 'creator_subscription',
      internalPlanCode: plan.code,
      provider: selectedGateway,
      billingCycle,
      currency: normalizedCurrency,
      regionCode: gatewaySelection.countryCode,
    });

    if (!mapping) {
      return NextResponse.json(
        {
          error: `Recurring mapping missing for ${selectedGateway} (${plan.code}/${billingCycle}/${normalizedCurrency})`,
          failClosed: true,
          code: 'missing_provider_plan_mapping',
        },
        { status: 503 }
      );
    }

    // Handle Stripe
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json(
          { error: 'Stripe not configured' },
          { status: 500 }
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
      if (mapping.provider_plan_id?.startsWith('price_')) {
        lineItems.push({
          price: mapping.provider_plan_id,
          quantity: 1,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: normalizedCurrency.toLowerCase(),
            unit_amount: Math.round(amountInCents),
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

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: lineItems as any,
        success_url: `${appUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
        subscription_data: {
          metadata: {
            photographer_id: user.id,
            subscription_scope: 'creator_subscription',
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: normalizedCurrency,
            pricing_amount_cents: String(Math.round(amountInCents)),
            provider_plan_id: mapping.provider_plan_id,
          },
        },
        metadata: {
          photographer_id: user.id,
          subscription_scope: 'creator_subscription',
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(Math.round(amountInCents)),
          provider_plan_id: mapping.provider_plan_id,
        },
      });

      return NextResponse.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      });
    }

    if (selectedGateway === 'paypal') {
      if (!isPayPalConfigured()) {
        return NextResponse.json({ error: 'PayPal is not configured' }, { status: 500 });
      }

      const customPayload = JSON.stringify({
        subscription_scope: 'creator_subscription',
        photographer_id: user.id,
        plan_code: plan.code,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        pricing_currency: normalizedCurrency,
        pricing_amount_cents: Math.round(amountInCents),
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
        return NextResponse.json(
          { error: 'Failed to create PayPal approval URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        checkoutUrl: approvalUrl,
        sessionId: subscription.id,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      });
    }

    if (selectedGateway === 'flutterwave') {
      if (!isFlutterwaveConfigured()) {
        return NextResponse.json({ error: 'Flutterwave is not configured' }, { status: 500 });
      }

      const txRef = `sub_${user.id}_${Date.now()}`;
      const payment = await initializeRecurringPayment({
        txRef,
        amount: Math.round(amountInCents),
        currency: normalizedCurrency,
        redirectUrl: `${appUrl}/dashboard/billing?success=true&provider=flutterwave&tx_ref=${encodeURIComponent(txRef)}`,
        customerEmail: user.email || '',
        paymentPlanId: mapping.provider_plan_id,
        metadata: {
          subscription_scope: 'creator_subscription',
          photographer_id: user.id,
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(Math.round(amountInCents)),
        },
      });

      return NextResponse.json({
        checkoutUrl: payment.link,
        sessionId: txRef,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      });
    }

    if (selectedGateway === 'paystack') {
      const paystackSecretKey = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      if (!paystackSecretKey) {
        return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
      }

      const reference = `sub_${user.id}_${Date.now()}`;
      const payment = await initializePaystackSubscription(
        {
          reference,
          email: user.email || '',
          amount: Math.round(amountInCents),
          currency: normalizedCurrency,
          callbackUrl: `${appUrl}/dashboard/billing?success=true&provider=paystack&reference=${encodeURIComponent(reference)}`,
          plan: mapping.provider_plan_id,
          metadata: {
            subscription_scope: 'creator_subscription',
            photographer_id: user.id,
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: normalizedCurrency,
            pricing_amount_cents: Math.round(amountInCents),
          },
        },
        paystackSecretKey
      );

      return NextResponse.json({
        checkoutUrl: payment.authorizationUrl,
        sessionId: payment.reference,
        gateway: selectedGateway,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      });
    }

    return NextResponse.json(
      {
        error: `Unsupported subscription gateway: ${selectedGateway}`,
        failClosed: true,
      },
      { status: 503 }
    );

  } catch (error) {
    console.error('Subscription checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

