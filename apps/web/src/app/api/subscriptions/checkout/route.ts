export const dynamic = 'force-dynamic';

/**
 * Subscription Checkout API
 * 
 * Create checkout session for subscription upgrade.
 */

import { NextRequest, NextResponse } from 'next/server';

import { isFlutterwaveConfigured, initializePayment } from '@/lib/payments/flutterwave';
import { selectPaymentGateway } from '@/lib/payments/gateway-selector';
import { isPayPalConfigured, createOrder, getApprovalUrl } from '@/lib/payments/paypal';
import { stripe } from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';

// Plan to Stripe price ID mapping (set these in your Stripe dashboard)
const STRIPE_PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || '',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
  },
  studio: {
    monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY || '',
    annual: process.env.STRIPE_PRICE_STUDIO_ANNUAL || '',
  },
};

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planCode, billingCycle = 'monthly' } = body;

    if (!planCode || planCode === 'free') {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    const priceIds = STRIPE_PRICE_IDS[planCode];
    if (!priceIds) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 400 }
      );
    }

    const priceId = billingCycle === 'annual' ? priceIds.annual : priceIds.monthly;
    
    if (!priceId) {
      // If no Stripe price configured, return error with setup instructions
      return NextResponse.json(
        { 
          error: 'Subscription pricing not configured',
          message: 'Please set up Stripe price IDs in environment variables',
          setupRequired: true,
        },
        { status: 400 }
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
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          photographer_id: user.id,
        },
      });

      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('photographers')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Select payment gateway based on user preference
    const gatewaySelection = await selectPaymentGateway({
      userId: user.id,
      currency: 'usd', // Subscription pricing is in USD
    });

    const selectedGateway = gatewaySelection.gateway;

    // Handle Stripe
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json(
          { error: 'Stripe not configured' },
          { status: 500 }
        );
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
        subscription_data: {
          metadata: {
            photographer_id: user.id,
            plan_code: planCode,
          },
        },
        metadata: {
          photographer_id: user.id,
          plan_code: planCode,
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

