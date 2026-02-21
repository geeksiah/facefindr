export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { getBillingSubscription } from '@/lib/payments/paypal';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import {
  resolvePaystackSecretKey,
  verifyPaystackTransaction,
} from '@/lib/payments/paystack';
import {
  mapProviderSubscriptionStatusToLocal,
  type RecurringProductScope,
} from '@/lib/payments/recurring-subscriptions';
import {
  parseMetadataRecord,
  readNumber,
  readString,
  syncRecurringSubscriptionRecord,
} from '@/lib/payments/recurring-sync';
import { stripe } from '@/lib/payments/stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function isSuccessfulPaystackStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return (
    normalized === 'success' ||
    normalized === 'successful' ||
    normalized === 'completed'
  );
}

function normalizeBillingCycle(value: string | null | undefined): 'monthly' | 'annual' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'annual' || normalized === 'yearly' || normalized === 'annually' || normalized === 'year') {
    return 'annual';
  }
  return 'monthly';
}

function getManualPeriodEndIso(billingCycle: 'monthly' | 'annual'): string {
  const now = Date.now();
  const durationMs =
    billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs).toISOString();
}

function readBooleanFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function parseMinorAmountFromMajor(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.max(0, Math.round(parsed * 100));
}

function resolveCancelAtPeriodEnd(
  metadata: Record<string, unknown>,
  manualRenewalMode: boolean
): boolean {
  if (manualRenewalMode) return true;
  const explicitCancelAtPeriodEnd = readBooleanFlag(metadata.cancel_at_period_end);
  if (explicitCancelAtPeriodEnd !== null) return explicitCancelAtPeriodEnd;
  const autoRenewPreference = readBooleanFlag(metadata.auto_renew_preference);
  return autoRenewPreference === false;
}

function resolveMappedStatus(
  rawStatus: string | null,
  scope: RecurringProductScope,
  fallback: 'active' | 'past_due' = 'active'
) {
  return mapProviderSubscriptionStatusToLocal(rawStatus, scope) || fallback;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }
    const creatorId = String(creatorProfile.id);

    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').trim().toLowerCase();
    const sessionId = String(body?.sessionId || '').trim();
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const txRef = String(body?.txRef || '').trim();
    const reference = String(body?.reference || '').trim();

    if (!['stripe', 'paypal', 'flutterwave', 'paystack'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported provider for subscription verification.' }, { status: 400 });
    }

    const { data: latestLocalSubscription } = await serviceClient
      .from('subscriptions')
      .select('metadata')
      .eq('photographer_id', creatorId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestMetadata = parseMetadataRecord(latestLocalSubscription?.metadata);
    const regionCode = readString(latestMetadata.region_code) || undefined;
    if (provider === 'stripe') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Stripe sessionId is required.' }, { status: 400 });
      }
      if (!stripe) {
        return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
      if (String(session.mode || '') !== 'subscription') {
        return NextResponse.json({ error: 'Stripe session is not a subscription checkout.' }, { status: 400 });
      }
      if (String(session.payment_status || '').toLowerCase() !== 'paid') {
        return NextResponse.json(
          { error: `Stripe checkout is not paid yet (status: ${session.payment_status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const sessionMetadata = parseMetadataRecord(session.metadata);
      const scope = readString(sessionMetadata.subscription_scope) || 'creator_subscription';
      if (scope !== 'creator_subscription') {
        return NextResponse.json({ error: 'Session is not a creator subscription checkout.' }, { status: 400 });
      }
      const metadataCreatorId = readString(sessionMetadata.photographer_id);
      if (metadataCreatorId && metadataCreatorId !== creatorId) {
        return NextResponse.json({ error: 'Session does not belong to this account.' }, { status: 403 });
      }

      const stripeSubscription =
        typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(session.subscription)
          : (session.subscription as any);
      if (!stripeSubscription?.id) {
        return NextResponse.json({ error: 'Stripe subscription not found on session.' }, { status: 400 });
      }

      const metadata = parseMetadataRecord(stripeSubscription.metadata || sessionMetadata);
      const mappedStatus = resolveMappedStatus(String(stripeSubscription.status || 'active'), 'creator_subscription');
      const unitAmount = Number(stripeSubscription.items?.data?.[0]?.price?.unit_amount || 0);
      const amountCents =
        readNumber(metadata.pricing_amount_cents) ||
        (Number.isFinite(unitAmount) ? Math.round(unitAmount) : null);
      const cancelAtPeriodEnd = Boolean(stripeSubscription.cancel_at_period_end);

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'stripe',
        scope: 'creator_subscription',
        status: mappedStatus,
        eventType: 'manual_verify',
        externalSubscriptionId: stripeSubscription.id,
        externalCustomerId:
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : null,
        externalPlanId:
          readString(metadata.provider_plan_id) ||
          readString(stripeSubscription.items?.data?.[0]?.price?.id) ||
          null,
        billingCycle: readString(metadata.billing_cycle) || 'monthly',
        currency:
          readString(stripeSubscription.items?.data?.[0]?.price?.currency)?.toUpperCase() ||
          readString(metadata.pricing_currency) ||
          'USD',
        amountCents,
        currentPeriodStart:
          stripeSubscription.current_period_start
            ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
            : new Date().toISOString(),
        currentPeriodEnd:
          stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
            : null,
        cancelAtPeriodEnd,
        canceledAt:
          stripeSubscription.canceled_at
            ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
            : null,
        photographerId: creatorId,
        planCode: readString(metadata.plan_code),
        planId: readString(metadata.plan_id),
        metadata: {
          ...metadata,
          verification_source: 'subscriptions.verify.api',
          stripe_session_id: session.id,
        },
      });
    } else if (provider === 'paypal') {
      if (!subscriptionId) {
        return NextResponse.json({ error: 'PayPal subscriptionId is required.' }, { status: 400 });
      }

      const latest = await getBillingSubscription(subscriptionId);
      const metadata = parseMetadataRecord(latest?.custom_id);
      const scope = readString(metadata.subscription_scope);
      if (scope !== 'creator_subscription') {
        return NextResponse.json({ error: 'Subscription is not a creator subscription.' }, { status: 400 });
      }
      const metadataCreatorId = readString(metadata.photographer_id);
      if (metadataCreatorId && metadataCreatorId !== creatorId) {
        return NextResponse.json({ error: 'Subscription does not belong to this account.' }, { status: 403 });
      }

      const mappedStatus = resolveMappedStatus(readString(latest.status) || 'active', 'creator_subscription');
      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const cancelAtPeriodEnd = resolveCancelAtPeriodEnd(metadata, manualRenewalMode);
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paypal',
        scope: 'creator_subscription',
        status: mappedStatus,
        eventType: 'manual_verify',
        externalSubscriptionId: manualRenewalMode ? null : latest.id,
        externalPlanId: readString(latest.plan_id) || readString(metadata.provider_plan_id),
        billingCycle,
        currency: readString(metadata.pricing_currency) || 'USD',
        amountCents: readNumber(metadata.pricing_amount_cents),
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd:
          readString(metadata.current_period_end) ||
          (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null),
        cancelAtPeriodEnd,
        canceledAt:
          mappedStatus === 'canceled' || mappedStatus === 'cancelled'
            ? new Date().toISOString()
            : null,
        photographerId: creatorId,
        planCode: readString(metadata.plan_code),
        planId: readString(metadata.plan_id),
        metadata: {
          ...metadata,
          verification_source: 'subscriptions.verify.api',
          paypal_subscription_status: latest.status || null,
        },
      });
    } else if (provider === 'flutterwave') {
      if (!txRef) {
        return NextResponse.json({ error: 'Flutterwave txRef is required.' }, { status: 400 });
      }

      const verified = await verifyTransactionByRef(txRef);
      const status = String(verified?.status || '').toLowerCase();
      if (status !== 'successful' && status !== 'success' && status !== 'completed') {
        return NextResponse.json(
          { error: `Flutterwave charge is not successful yet (status: ${verified?.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord(verified?.meta);
      const scope = readString(metadata.subscription_scope);
      if (scope !== 'creator_subscription') {
        return NextResponse.json({ error: 'Transaction is not a creator subscription payment.' }, { status: 400 });
      }
      const metadataCreatorId = readString(metadata.photographer_id);
      if (metadataCreatorId && metadataCreatorId !== creatorId) {
        return NextResponse.json({ error: 'Transaction does not belong to this account.' }, { status: 403 });
      }

      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const cancelAtPeriodEnd = resolveCancelAtPeriodEnd(metadata, manualRenewalMode);
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));
      const mappedStatus = resolveMappedStatus(readString(verified.status), 'creator_subscription');

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'flutterwave',
        scope: 'creator_subscription',
        status: mappedStatus,
        eventType: 'manual_verify',
        externalSubscriptionId:
          manualRenewalMode
            ? null
            : readString(metadata.subscription_id) ||
              readString(metadata.provider_subscription_id) ||
              txRef,
        externalCustomerId:
          (verified.customer?.id ? String(verified.customer.id) : null) ||
          readString(verified.customer?.email),
        externalPlanId:
          readString(metadata.provider_plan_id) ||
          readString((verified as any).payment_plan) ||
          readString((verified as any).plan),
        billingCycle,
        currency: readString(verified.currency) || readString(metadata.pricing_currency) || 'USD',
        amountCents:
          readNumber(metadata.pricing_amount_cents) ||
          parseMinorAmountFromMajor((verified as any).charged_amount) ||
          parseMinorAmountFromMajor((verified as any).amount),
        currentPeriodStart: readString((verified as any).charged_at) || new Date().toISOString(),
        currentPeriodEnd:
          readString(metadata.current_period_end) ||
          (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null),
        cancelAtPeriodEnd,
        canceledAt:
          mappedStatus === 'canceled' || mappedStatus === 'cancelled'
            ? new Date().toISOString()
            : null,
        photographerId: creatorId,
        planCode: readString(metadata.plan_code),
        planId: readString(metadata.plan_id),
        metadata: {
          ...metadata,
          verification_source: 'subscriptions.verify.api',
          flutterwave_tx_ref: txRef,
        },
      });
    } else {
      if (!reference) {
        return NextResponse.json({ error: 'Paystack reference is required.' }, { status: 400 });
      }

      const secretKey = (await resolvePaystackSecretKey(regionCode)) || (await resolvePaystackSecretKey());
      if (!secretKey) {
        return NextResponse.json({ error: 'Paystack is not configured.' }, { status: 500 });
      }

      const verified = await verifyPaystackTransaction(reference, secretKey);
      if (!isSuccessfulPaystackStatus(verified.status)) {
        return NextResponse.json(
          { error: `Payment is not yet successful (status: ${verified.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord(verified.metadata);
      const scope = readString(metadata.subscription_scope) || 'creator_subscription';
      if (scope !== 'creator_subscription') {
        return NextResponse.json(
          { error: 'Reference is not a creator subscription payment.' },
          { status: 400 }
        );
      }

      const metadataCreatorId = readString(metadata.photographer_id);
      const referenceBelongsToCreator = reference.startsWith(`sub_${creatorId}_`);
      if (metadataCreatorId && metadataCreatorId !== creatorId) {
        return NextResponse.json({ error: 'Payment does not belong to this account.' }, { status: 403 });
      }
      if (!metadataCreatorId && !referenceBelongsToCreator) {
        return NextResponse.json({ error: 'Unable to verify payment ownership.' }, { status: 403 });
      }

      const providerPlanId =
        readString(metadata.provider_plan_id) ||
        readString((verified as any)?.plan?.plan_code);
      const billingCycle = normalizeBillingCycle(
        readString(metadata.billing_cycle) ||
          readString((verified as any)?.plan?.interval)
      );
      const amountCents =
        readNumber(metadata.pricing_amount_cents) ??
        (Number.isFinite(Number(verified.amount)) ? Math.round(Number(verified.amount)) : null);
      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode =
        renewalMode === 'manual_renewal' ||
        readBooleanFlag(metadata.manual_renewal) === true;
      const cancelAtPeriodEnd = resolveCancelAtPeriodEnd(metadata, manualRenewalMode);
      const currentPeriodEnd =
        readString(metadata.current_period_end) ||
        (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null);
      const externalSubscriptionId =
        manualRenewalMode
          ? null
          : readString((verified as any)?.subscription?.subscription_code) ||
            readString(metadata.subscription_id) ||
            reference;

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paystack',
        scope: 'creator_subscription',
        status: 'active',
        eventType: 'manual_verify',
        externalSubscriptionId,
        externalPlanId: providerPlanId,
        billingCycle,
        currency: readString(verified.currency) || readString(metadata.pricing_currency) || 'USD',
        amountCents,
        currentPeriodStart: readString(verified.paid_at) || new Date().toISOString(),
        currentPeriodEnd,
        cancelAtPeriodEnd,
        photographerId: creatorId,
        planCode: readString(metadata.plan_code),
        planId: readString(metadata.plan_id),
        metadata: {
          ...metadata,
          paystack_reference: reference,
          verification_source: 'subscriptions.verify.api',
          renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        },
      });
    }

    const nowIso = new Date().toISOString();
    const { data: subscriptions } = await serviceClient
      .from('subscriptions')
      .select('id, plan_id, plan_code, status, current_period_end, cancel_at_period_end, payment_provider')
      .eq('photographer_id', creatorId)
      .in('status', ['active', 'trialing'])
      .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);
    const subscription =
      subscriptions?.find((row: any) => String(row.plan_code || '').toLowerCase() !== 'free') ||
      subscriptions?.[0] ||
      null;

    return NextResponse.json({
      success: true,
      subscription: subscription || null,
      reference: reference || null,
      provider,
    });
  } catch (error: any) {
    console.error('Creator subscription verification error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to verify creator subscription payment.' },
      { status: 500 }
    );
  }
}
