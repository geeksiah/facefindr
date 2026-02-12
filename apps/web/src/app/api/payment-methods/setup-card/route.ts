export const dynamic = 'force-dynamic';

/**
 * Card Setup API
 * 
 * Creates a Stripe Setup Intent for adding a new card.
 * Redirects to Stripe's hosted setup page.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Stripe not configured');
      return NextResponse.redirect(new URL('/dashboard/billing?error=stripe_not_configured', request.url));
    }

    // Get or create Stripe customer
    let stripeCustomerId: string;

    const { data: existingCustomer } = await supabase
      .from('photographers')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (existingCustomer?.stripe_customer_id) {
      stripeCustomerId = existingCustomer.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Save to database
      await supabase
        .from('photographers')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
    }

    // Create Checkout Session for setup mode (adding payment method)
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'setup',
      payment_method_types: ['card'],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/dashboard/billing?setup=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/dashboard/billing?setup=cancelled`,
      metadata: {
        user_id: user.id,
      },
    });

    if (!session.url) {
      throw new Error('Failed to create Stripe session');
    }

    return NextResponse.redirect(session.url);

  } catch (error) {
    console.error('Card setup error:', error);
    return NextResponse.redirect(new URL('/dashboard/billing?error=setup_failed', request.url));
  }
}

