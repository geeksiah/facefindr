export const dynamic = 'force-dynamic';

/**
 * Subscription Checkout API
 * 
 * Create checkout session for subscription upgrade.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getAppUrl } from '@/lib/env';
import { isFlutterwaveConfigured, initializePayment } from '@/lib/payments/flutterwave';
import { GatewaySelectionError, selectPaymentGateway } from '@/lib/payments/gateway-selector';
import { isPayPalConfigured, createOrder, getApprovalUrl } from '@/lib/payments/paypal';
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
    const plan = await getPlanByCode(planCode, 'photographer');
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { error: 'Plan is not available', failClosed: true },
        { status: 503 }
      );
    }

    const normalizedCurrency = String(requestedCurrency || 'USD').toUpperCase();
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

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
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
          },
        ],
        success_url: `${appUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/billing?canceled=true`,
        subscription_data: {
          metadata: {
            photographer_id: user.id,
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: normalizedCurrency,
            pricing_amount_cents: String(Math.round(amountInCents)),
          },
        },
        metadata: {
          photographer_id: user.id,
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(Math.round(amountInCents)),
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

    // For other gateways, subscriptions might need different handling
    // For now, return error if non-Stripe is selected (subscriptions typically use Stripe)
    return NextResponse.json({
      error: `Subscriptions are currently only available via Stripe. Please use Stripe or contact support.`,
      suggestedGateway: 'stripe',
      availableGateways: gatewaySelection.availableGateways,
    }, { status: 400 });

  } catch (error) {
    console.error('Subscription checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

