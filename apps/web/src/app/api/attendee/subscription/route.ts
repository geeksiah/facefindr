export const dynamic = 'force-dynamic';

/**
 * Attendee Subscription Management API
 * 
 * Handles premium subscriptions for attendees
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency';
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
  initializePaystackPayment,
  initializePaystackSubscription,
  resolvePaystackPublicKey,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import { resolveProviderPlanMapping } from '@/lib/payments/recurring-subscriptions';
import { stripe } from '@/lib/payments/stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function getManualPeriodEndIso(billingCycle: 'monthly' | 'annual'): string {
  const now = Date.now();
  const durationMs =
    billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs).toISOString();
}

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

    const {
      planCode,
      billingCycle: requestedBillingCycle = 'monthly',
      currency: requestedCurrency,
      paymentChannel: requestedPaymentChannel,
    } =
      await request.json();
    if (!planCode || typeof planCode !== 'string') {
      return NextResponse.json({ error: 'Invalid plan code' }, { status: 400 });
    }
    const billingCycle =
      requestedBillingCycle === 'annual' || requestedBillingCycle === 'yearly'
        ? 'annual'
        : 'monthly';
    const normalizedPaymentChannelRaw = String(requestedPaymentChannel || 'auto').trim().toLowerCase();
    const paymentChannel: 'auto' | 'card' | 'mobile_money' =
      normalizedPaymentChannelRaw === 'card' || normalizedPaymentChannelRaw === 'mobile_money'
        ? normalizedPaymentChannelRaw
        : normalizedPaymentChannelRaw === 'auto'
        ? 'auto'
        : 'auto';
    if (
      normalizedPaymentChannelRaw &&
      !['auto', 'card', 'mobile_money'].includes(normalizedPaymentChannelRaw)
    ) {
      return NextResponse.json({ error: 'Invalid payment channel' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    const { data: plan } = await serviceClient
      .from('subscription_plans')
      .select('code, name, description, plan_type, is_active, base_price_usd, prices')
      .eq('code', planCode)
      .eq('plan_type', 'drop_in')
      .eq('is_active', true)
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not configured in admin pricing', failClosed: true },
        { status: 503 }
      );
    }

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const fallbackCurrency = await getEffectiveCurrency(user.id, detectedCountry);
    const normalizedCurrency = String(requestedCurrency || fallbackCurrency || 'USD').toUpperCase();
    const planPrices = (plan.prices as Record<string, number> | null) || {};
    const unitAmount = planPrices[normalizedCurrency] ?? planPrices.USD ?? plan.base_price_usd ?? 0;
    if (!unitAmount || unitAmount <= 0) {
      return NextResponse.json(
        { error: 'Plan price is not configured', failClosed: true },
        { status: 503 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Select payment gateway based on user preference
    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user.id,
        currency: normalizedCurrency.toLowerCase(),
        productType: 'attendee_subscription',
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
      productScope: 'attendee_subscription',
      internalPlanCode: planCode,
      provider: selectedGateway,
      billingCycle,
      currency: normalizedCurrency,
      regionCode: gatewaySelection.countryCode,
    });

    if (!mapping && selectedGateway !== 'paystack') {
      return NextResponse.json(
        {
          error: `Recurring mapping missing for ${selectedGateway} (${planCode}/${billingCycle}/${normalizedCurrency})`,
          failClosed: true,
          code: 'missing_provider_plan_mapping',
        },
        { status: 503 }
      );
    }

    // Handle Stripe
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
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
            currency: normalizedCurrency.toLowerCase(),
            product_data: {
              name: plan.name || `Ferchr ${planCode}`,
              description: plan.description || 'Attendee subscription',
            },
            recurring: {
              interval: billingCycle === 'annual' ? 'year' : 'month',
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email || undefined,
        payment_method_types: ['card'],
        line_items: lineItems as any,
        mode: 'subscription',
        success_url: `${baseUrl}/gallery/billing?subscription=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/gallery/billing?subscription=canceled&provider=stripe`,
        subscription_data: {
          metadata: {
            subscription_scope: 'attendee_subscription',
            attendee_id: user.id,
            plan_code: planCode,
            billing_cycle: billingCycle,
            payment_channel: paymentChannel,
            pricing_currency: normalizedCurrency,
            pricing_amount_cents: String(unitAmount),
            provider_plan_id: mapping?.provider_plan_id || 'dynamic',
          },
        },
        metadata: {
          type: 'attendee_subscription',
          subscription_scope: 'attendee_subscription',
          attendee_id: user.id,
          plan_code: planCode,
          billing_cycle: billingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(unitAmount),
          provider_plan_id: mapping?.provider_plan_id || 'dynamic',
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

    if (selectedGateway === 'paypal') {
      if (!mapping) {
        return NextResponse.json(
          { error: 'Recurring mapping missing for PayPal attendee plan', code: 'missing_provider_plan_mapping' },
          { status: 503 }
        );
      }
      if (!isPayPalConfigured()) {
        return NextResponse.json({ error: 'PayPal is not configured' }, { status: 500 });
      }

      const subscription = await createBillingSubscription({
        planId: mapping.provider_plan_id,
        returnUrl: `${baseUrl}/gallery/billing?subscription=success&provider=paypal&subscription_id={subscription_id}`,
        cancelUrl: `${baseUrl}/gallery/billing?subscription=canceled&provider=paypal`,
        customId: JSON.stringify({
          subscription_scope: 'attendee_subscription',
          attendee_id: user.id,
          plan_code: planCode,
          billing_cycle: billingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: unitAmount,
        }),
        subscriber: {
          email: user.email || undefined,
        },
      });

      const approvalUrl = getApprovalUrl(subscription as any);
      if (!approvalUrl) {
        return NextResponse.json({ error: 'Failed to create PayPal approval URL' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
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
      if (!mapping) {
        return NextResponse.json(
          { error: 'Recurring mapping missing for Flutterwave attendee plan', code: 'missing_provider_plan_mapping' },
          { status: 503 }
        );
      }
      if (!isFlutterwaveConfigured()) {
        return NextResponse.json({ error: 'Flutterwave is not configured' }, { status: 500 });
      }

      const txRef = `att_sub_${user.id}_${Date.now()}`;
      const payment = await initializeRecurringPayment({
        txRef,
        amount: unitAmount,
        currency: normalizedCurrency,
        redirectUrl: `${baseUrl}/gallery/billing?subscription=success&provider=flutterwave&tx_ref=${encodeURIComponent(txRef)}`,
        customerEmail: user.email || '',
        paymentPlanId: mapping.provider_plan_id,
        metadata: {
          subscription_scope: 'attendee_subscription',
          attendee_id: user.id,
          plan_code: planCode,
          billing_cycle: billingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(unitAmount),
        },
      });

      return NextResponse.json({
        success: true,
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
      const paystackPublicKey = await resolvePaystackPublicKey(gatewaySelection.countryCode);
      const paystackRegionCode = gatewaySelection.countryCode || 'GLOBAL';
      if (!paystackSecretKey) {
        return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
      }

      const manualRenewalMode = !mapping || paymentChannel === 'mobile_money';
      const reference = `att_sub_${user.id}_${Date.now()}`;
      const manualPeriodEndIso = manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null;
      const metadata = {
        subscription_scope: 'attendee_subscription',
        attendee_id: user.id,
        plan_code: planCode,
        billing_cycle: billingCycle,
        payment_channel: paymentChannel,
        pricing_currency: normalizedCurrency,
        pricing_amount_cents: unitAmount,
        renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        current_period_end: manualPeriodEndIso,
        auto_renew_preference: manualRenewalMode ? 'false' : 'true',
        cancel_at_period_end: manualRenewalMode ? 'true' : 'false',
        region_code: gatewaySelection.countryCode || null,
      };

      const payment = manualRenewalMode
        ? await initializePaystackPayment(
            {
              reference,
              email: user.email || '',
              amount: unitAmount,
              currency: normalizedCurrency,
              callbackUrl: `${baseUrl}/gallery/billing?subscription=success&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              metadata,
            },
            paystackSecretKey
          )
        : await initializePaystackSubscription(
            {
              reference,
              email: user.email || '',
              amount: unitAmount,
              currency: normalizedCurrency,
              callbackUrl: `${baseUrl}/gallery/billing?subscription=success&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              plan: mapping!.provider_plan_id,
              metadata,
            },
            paystackSecretKey
          );

      return NextResponse.json({
        success: true,
        checkoutUrl: payment.authorizationUrl,
        sessionId: payment.reference,
        gateway: selectedGateway,
        paystack: paystackPublicKey
          ? {
              publicKey: paystackPublicKey,
              email: user.email || '',
              amount: unitAmount,
              currency: normalizedCurrency,
              reference: payment.reference,
              accessCode: payment.accessCode,
              regionCode: paystackRegionCode,
            }
          : null,
        renewalMode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        currentPeriodEnd: manualPeriodEndIso,
        autoRenewSupported: !manualRenewalMode,
        regionCode: paystackRegionCode,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      });
    }

    return NextResponse.json(
      { error: `Unsupported attendee subscription gateway: ${selectedGateway}`, failClosed: true },
      { status: 503 }
    );

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
      .select('stripe_subscription_id, external_subscription_id, payment_provider')
      .eq('attendee_id', user.id)
      .single();

    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }

    // Cancel Stripe subscription (for other providers we mark cancellation intent locally)
    if (
      (subscription.payment_provider === 'stripe' || !subscription.payment_provider) &&
      subscription.stripe_subscription_id &&
      stripe
    ) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    // Update local subscription
    await supabase
      .from('attendee_subscriptions')
      .update({
        canceled_at: new Date().toISOString(),
        last_webhook_event_at: new Date().toISOString(),
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

