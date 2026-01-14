/**
 * Vault Subscription API
 * 
 * POST - Subscribe to a storage plan
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planSlug, billingCycle } = body;

    if (!planSlug || !billingCycle) {
      return NextResponse.json(
        { error: 'Plan and billing cycle are required' },
        { status: 400 }
      );
    }

    // Get the plan
    const { data: plan, error: planError } = await supabase
      .from('storage_plans')
      .select('*')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    // Check if it's a free plan
    if (plan.slug === 'free') {
      // Cancel any existing subscription and set to free
      await supabase
        .from('storage_subscriptions')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('status', 'active');

      // Update user's storage limits to free tier
      await supabase.rpc('sync_subscription_limits', { p_user_id: user.id });

      return NextResponse.json({
        success: true,
        message: 'Switched to free plan',
      });
    }

    // For paid plans, create Stripe checkout session
    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment processing not configured' },
        { status: 500 }
      );
    }

    const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe price if needed (or use pre-created price IDs)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: {
              name: `${plan.name} Storage Plan`,
              description: plan.description,
              metadata: {
                plan_id: plan.id,
                plan_slug: plan.slug,
              },
            },
            unit_amount: Math.round(price * 100), // Convert to cents
            recurring: {
              interval: billingCycle === 'yearly' ? 'year' : 'month',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle: billingCycle,
        type: 'storage_subscription',
      },
      success_url: `${appUrl}/gallery/vault?subscription=success`,
      cancel_url: `${appUrl}/gallery/vault?subscription=cancelled`,
    });

    return NextResponse.json({
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error('Vault subscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
