export const dynamic = 'force-dynamic';

/**
 * Attendee Subscription Management API
 * 
 * Handles premium subscriptions for attendees
 */

import { NextRequest, NextResponse } from 'next/server';

import { selectPaymentGateway } from '@/lib/payments/gateway-selector';
import { stripe } from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';

// GET - Get current subscription
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: subscription, error } = await supabase
      .from('attendee_subscriptions')
      .select('*')
      .eq('attendee_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      subscription: subscription || {
        plan_code: 'free',
        status: 'active',
        can_discover_non_contacts: false,
        can_upload_drop_ins: false,
        can_receive_all_drop_ins: false,
        can_search_social_media: false,
        can_search_web: false,
      },
    });

  } catch (error) {
    console.error('Subscription fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// POST - Create or update subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planCode } = await request.json();

    if (!planCode || !['premium', 'premium_plus'].includes(planCode)) {
      return NextResponse.json({ error: 'Invalid plan code' }, { status: 400 });
    }

    // Pricing (monthly)
    const pricing = {
      premium: 499, // $4.99/month
      premium_plus: 999, // $9.99/month
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Select payment gateway based on user preference
    const gatewaySelection = await selectPaymentGateway({
      userId: user.id,
      currency: 'usd', // Subscription pricing is in USD
    });

    const selectedGateway = gatewaySelection.gateway;

    // Handle Stripe (primary for subscriptions)
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
      }

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email || undefined,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: planCode === 'premium' ? 'FaceFindr Premium' : 'FaceFindr Premium Plus',
                description: planCode === 'premium'
                  ? 'Discover photos from non-contacts, upload drop-ins, receive all notifications'
                  : 'All Premium features + social media & web search',
              },
              recurring: {
                interval: 'month',
              },
              unit_amount: pricing[planCode as keyof typeof pricing],
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/subscription?canceled=true`,
        metadata: {
          type: 'attendee_subscription',
          attendee_id: user.id,
          plan_code: planCode,
        },
      });

      return NextResponse.json({
        success: true,
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
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel subscription
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: subscription } = await supabase
      .from('attendee_subscriptions')
      .select('stripe_subscription_id')
      .eq('attendee_id', user.id)
      .single();

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // Cancel Stripe subscription
    if (subscription.stripe_subscription_id && stripe) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    // Update local subscription
    await supabase
      .from('attendee_subscriptions')
      .update({
        cancel_at_period_end: true,
      })
      .eq('attendee_id', user.id);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

