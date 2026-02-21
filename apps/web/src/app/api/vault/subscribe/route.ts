export const dynamic = 'force-dynamic';

/**
 * Vault Subscription API
 * 
 * POST - Subscribe to a storage plan
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

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
import { createClient } from '@/lib/supabase/server';

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

function getManualPeriodEndIso(billingCycle: 'monthly' | 'annual'): string {
  const now = Date.now();
  const durationMs =
    billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs).toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      planSlug,
      billingCycle,
      currency: requestedCurrency,
    } = body;

    if (!planSlug || !billingCycle) {
      return NextResponse.json(
        { error: 'Plan and billing cycle are required' },
        { status: 400 }
      );
    }
    const paymentChannel: 'auto' = 'auto';

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

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const fallbackCurrency = await getEffectiveCurrency(user.id, detectedCountry);
    const normalizedCurrency = String(
      requestedCurrency || fallbackCurrency || plan.currency || 'USD'
    ).toUpperCase();
    const normalizedBillingCycle =
      billingCycle === 'yearly' || billingCycle === 'annual' ? 'annual' : 'monthly';
    const rawPrice = normalizedBillingCycle === 'annual' ? plan.price_yearly : plan.price_monthly;
    const priceCents = Math.round(Number(rawPrice || 0) * 100);
    if (!priceCents || priceCents <= 0) {
      return NextResponse.json(
        { error: 'Storage plan price is not configured', failClosed: true },
        { status: 503 }
      );
    }

    let gatewaySelection;
    try {
      gatewaySelection = await selectPaymentGateway({
        userId: user.id,
        currency: normalizedCurrency.toLowerCase(),
        productType: 'vault_subscription',
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

    const configuredGateways = Array.from(
      new Set([gatewaySelection.gateway, ...(gatewaySelection.availableGateways || [])])
    );
    let selectedGateway = gatewaySelection.gateway;
    const mappingAliases = Array.from(
      new Set([plan.slug, `${plan.slug}_vault`, `vault_${plan.slug}`])
    );
    let mapping = await resolveProviderPlanMapping({
      productScope: 'vault_subscription',
      internalPlanCode: plan.slug,
      internalPlanCodeAliases: mappingAliases,
      provider: selectedGateway,
      billingCycle: normalizedBillingCycle,
      currency: normalizedCurrency,
      regionCode: gatewaySelection.countryCode,
    });

    // Mapping fallback strategy:
    // - Stripe can run recurring in dynamic mode without provider_plan_mappings.
    // - Other providers require mapping, so try other configured gateways.
    if (!mapping && selectedGateway !== 'stripe') {
      for (const candidate of configuredGateways) {
        if (candidate === selectedGateway) continue;
        if (candidate === 'stripe' && stripe) {
          selectedGateway = 'stripe';
          break;
        }
        const candidateMapping = await resolveProviderPlanMapping({
          productScope: 'vault_subscription',
          internalPlanCode: plan.slug,
          internalPlanCodeAliases: mappingAliases,
          provider: candidate,
          billingCycle: normalizedBillingCycle,
          currency: normalizedCurrency,
          regionCode: gatewaySelection.countryCode,
        });
        if (candidateMapping) {
          mapping = candidateMapping;
          selectedGateway = candidate;
          break;
        }
      }
    }

    if (!mapping && !(selectedGateway === 'stripe' && stripe) && selectedGateway !== 'paystack') {
      return NextResponse.json(
        {
          error: `Recurring mapping missing for available gateways (${configuredGateways.join(', ')}) on ${plan.slug}/${normalizedBillingCycle}/${normalizedCurrency}`,
          failClosed: true,
          code: 'missing_provider_plan_mapping',
        },
        { status: 503 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return NextResponse.json(
          { error: 'Payment processing not configured' },
          { status: 500 }
        );
      }

      const lineItems: any[] = [];
      if (mapping?.provider_plan_id?.startsWith('price_')) {
        lineItems.push({
          price: mapping?.provider_plan_id,
          quantity: 1,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: normalizedCurrency.toLowerCase(),
            product_data: {
              name: `${plan.name} Storage Plan`,
              description: plan.description,
              metadata: {
                plan_id: plan.id,
                plan_slug: plan.slug,
              },
            },
            unit_amount: priceCents,
            recurring: {
              interval: normalizedBillingCycle === 'annual' ? 'year' : 'month',
            },
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: lineItems as any,
        subscription_data: {
          metadata: {
            subscription_scope: 'vault_subscription',
            user_id: user.id,
            plan_id: plan.id,
            plan_slug: plan.slug,
            billing_cycle: normalizedBillingCycle,
            payment_channel: paymentChannel,
            pricing_currency: normalizedCurrency,
            pricing_amount_cents: String(priceCents),
            provider_plan_id: mapping?.provider_plan_id || 'dynamic',
          },
        },
        metadata: {
          subscription_scope: 'vault_subscription',
          user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_cycle: normalizedBillingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(priceCents),
          provider_plan_id: mapping?.provider_plan_id || 'dynamic',
          type: 'storage_subscription',
        },
        success_url: `${appUrl}/gallery/vault?subscription=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/gallery/vault?subscription=cancelled&provider=stripe`,
      });

      return NextResponse.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        gateway: selectedGateway,
      });
    }

    if (selectedGateway === 'paypal') {
      if (!mapping) {
        return NextResponse.json(
          { error: 'Recurring mapping missing for PayPal vault plan', code: 'missing_provider_plan_mapping' },
          { status: 503 }
        );
      }
      if (!isPayPalConfigured()) {
        return NextResponse.json({ error: 'PayPal is not configured' }, { status: 500 });
      }

      const subscription = await createBillingSubscription({
        planId: mapping.provider_plan_id,
        returnUrl: `${appUrl}/gallery/vault?subscription=success&provider=paypal&subscription_id={subscription_id}`,
        cancelUrl: `${appUrl}/gallery/vault?subscription=cancelled&provider=paypal`,
        customId: JSON.stringify({
          subscription_scope: 'vault_subscription',
          user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_cycle: normalizedBillingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: priceCents,
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
        checkoutUrl: approvalUrl,
        sessionId: subscription.id,
        gateway: selectedGateway,
      });
    }

    if (selectedGateway === 'flutterwave') {
      if (!mapping) {
        return NextResponse.json(
          { error: 'Recurring mapping missing for Flutterwave vault plan', code: 'missing_provider_plan_mapping' },
          { status: 503 }
        );
      }
      if (!isFlutterwaveConfigured()) {
        return NextResponse.json({ error: 'Flutterwave is not configured' }, { status: 500 });
      }

      const txRef = `vault_sub_${user.id}_${Date.now()}`;
      const payment = await initializeRecurringPayment({
        txRef,
        amount: priceCents,
        currency: normalizedCurrency,
        redirectUrl: `${appUrl}/gallery/vault?subscription=success&provider=flutterwave&tx_ref=${encodeURIComponent(txRef)}`,
        customerEmail: user.email || '',
        paymentPlanId: mapping.provider_plan_id,
        metadata: {
          subscription_scope: 'vault_subscription',
          user_id: user.id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_cycle: normalizedBillingCycle,
          payment_channel: paymentChannel,
          pricing_currency: normalizedCurrency,
          pricing_amount_cents: String(priceCents),
        },
      });

      return NextResponse.json({
        checkoutUrl: payment.link,
        sessionId: txRef,
        gateway: selectedGateway,
      });
    }

    if (selectedGateway === 'paystack') {
      const paystackSecretKey = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      const paystackPublicKey = await resolvePaystackPublicKey(gatewaySelection.countryCode);
      const paystackRegionCode = gatewaySelection.countryCode || 'GLOBAL';
      if (!paystackSecretKey) {
        return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
      }

      const manualRenewalMode = !mapping;
      const reference = `vault_sub_${user.id}_${Date.now()}`;
      const manualPeriodEndIso = manualRenewalMode ? getManualPeriodEndIso(normalizedBillingCycle) : null;
      const metadata = {
        subscription_scope: 'vault_subscription',
        user_id: user.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle: normalizedBillingCycle,
        payment_channel: paymentChannel,
        pricing_currency: normalizedCurrency,
        pricing_amount_cents: priceCents,
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
              amount: priceCents,
              currency: normalizedCurrency,
              callbackUrl: `${appUrl}/gallery/vault?subscription=success&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              metadata,
            },
            paystackSecretKey
          )
        : await initializePaystackSubscription(
            {
              reference,
              email: user.email || '',
              amount: priceCents,
              currency: normalizedCurrency,
              callbackUrl: `${appUrl}/gallery/vault?subscription=success&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              plan: mapping!.provider_plan_id,
              metadata,
            },
            paystackSecretKey
          );

      await supabase
        .from('storage_subscriptions')
        .upsert(
          {
            user_id: user.id,
            plan_id: plan.id,
            status: 'pending',
            billing_cycle: normalizedBillingCycle,
            price_paid: priceCents / 100,
            currency: normalizedCurrency,
            payment_provider: 'paystack',
            external_subscription_id: payment.reference,
            metadata: {
              ...metadata,
              paystack_reference: payment.reference,
              pending_checkout: true,
            },
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' }
        )
        .then(() => null)
        .catch((error: any) => {
          // Best effort pre-seeding; webhook/verify path remains source of truth.
          console.error('Failed to pre-seed pending vault subscription row:', error);
          return null;
        });

      return NextResponse.json({
        checkoutUrl: payment.authorizationUrl,
        sessionId: payment.reference,
        gateway: selectedGateway,
        paystack: paystackPublicKey
          ? {
              publicKey: paystackPublicKey,
              email: user.email || '',
              amount: priceCents,
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
      });
    }

    return NextResponse.json(
      { error: `Unsupported vault subscription gateway: ${selectedGateway}`, failClosed: true },
      { status: 503 }
    );
  } catch (error) {
    console.error('Vault subscribe error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

