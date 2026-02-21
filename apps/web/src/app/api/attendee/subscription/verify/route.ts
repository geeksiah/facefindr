export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { getBillingSubscription } from '@/lib/payments/paypal';
import {
  PaystackApiError,
  resolvePaystackSecretKeyCandidates,
  verifyPaystackTransaction,
} from '@/lib/payments/paystack';
import { mapProviderSubscriptionStatusToLocal } from '@/lib/payments/recurring-subscriptions';
import {
  parseMetadataRecord,
  readNumber,
  readString,
  syncRecurringSubscriptionRecord,
} from '@/lib/payments/recurring-sync';
import { stripe } from '@/lib/payments/stripe';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function normalizeBillingCycle(value: string | null | undefined): 'monthly' | 'annual' {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'annual' ||
    normalized === 'yearly' ||
    normalized === 'annually' ||
    normalized === 'year'
  ) {
    return 'annual';
  }
  return 'monthly';
}

function isSuccessfulStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'success' || normalized === 'successful' || normalized === 'completed';
}

function getManualPeriodEndIso(billingCycle: 'monthly' | 'annual'): string {
  const now = Date.now();
  const durationMs =
    billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs).toISOString();
}

function parseMinorAmountFromMajor(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.max(0, Math.round(parsed * 100));
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
  fallback: 'active' | 'past_due' = 'active'
) {
  return mapProviderSubscriptionStatusToLocal(rawStatus, 'attendee_subscription') || fallback;
}

function metadataBelongsToUser(
  metadataAttendeeId: string | null,
  userId: string,
  attendeeId: string
) {
  if (!metadataAttendeeId) return false;
  return metadataAttendeeId === userId || metadataAttendeeId === attendeeId;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  return (
    code === '42P01' ||
    (code === 'PGRST205' &&
      message.includes('schema cache') &&
      message.includes('could not find the table'))
  );
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  return (
    code === '42703' ||
    (code.startsWith('PGRST') && message.includes('schema cache') && message.includes('column'))
  );
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

    const { data: attendeeProfile } = await resolveAttendeeProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!attendeeProfile?.id) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }
    const attendeeId = String(attendeeProfile.id);

    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').trim().toLowerCase();
    const sessionId = String(body?.sessionId || '').trim();
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const txRef = String(body?.txRef || '').trim();
    const reference = String(body?.reference || '').trim();

    if (!['stripe', 'paypal', 'flutterwave', 'paystack'].includes(provider)) {
      return NextResponse.json(
        { error: 'Unsupported provider for attendee subscription verification.' },
        { status: 400 }
      );
    }

    const { data: latestSubscription } = await serviceClient
      .from('attendee_subscriptions')
      .select('id, metadata')
      .eq('attendee_id', attendeeId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestMetadata = parseMetadataRecord(latestSubscription?.metadata);
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
        return NextResponse.json(
          { error: 'Stripe session is not a subscription checkout.' },
          { status: 400 }
        );
      }
      if (String(session.payment_status || '').toLowerCase() !== 'paid') {
        return NextResponse.json(
          { error: `Stripe checkout is not paid yet (status: ${session.payment_status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const sessionMetadata = parseMetadataRecord(session.metadata);
      const scope = readString(sessionMetadata.subscription_scope) || 'attendee_subscription';
      if (scope !== 'attendee_subscription') {
        return NextResponse.json(
          { error: 'Session is not an attendee subscription checkout.' },
          { status: 400 }
        );
      }
      const metadataAttendeeId = readString(sessionMetadata.attendee_id);
      if (
        metadataAttendeeId &&
        !metadataBelongsToUser(metadataAttendeeId, user.id, attendeeId)
      ) {
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
      const mappedStatus = resolveMappedStatus(String(stripeSubscription.status || 'active'));
      const unitAmount = Number(stripeSubscription.items?.data?.[0]?.price?.unit_amount || 0);
      const amountCents =
        readNumber(metadata.pricing_amount_cents) ||
        (Number.isFinite(unitAmount) ? Math.round(unitAmount) : null);

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'stripe',
        scope: 'attendee_subscription',
        status: mappedStatus,
        eventType: 'manual_verify',
        externalSubscriptionId: stripeSubscription.id,
        externalCustomerId:
          typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : null,
        externalPlanId:
          readString(metadata.provider_plan_id) ||
          readString(stripeSubscription.items?.data?.[0]?.price?.id),
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
        cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        canceledAt:
          stripeSubscription.canceled_at
            ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
            : null,
        attendeeId,
        planCode: readString(metadata.plan_code),
        metadata: {
          ...metadata,
          verification_source: 'attendee.subscription.verify.api',
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
      if (scope !== 'attendee_subscription') {
        return NextResponse.json({ error: 'Subscription is not an attendee subscription.' }, { status: 400 });
      }
      const metadataAttendeeId = readString(metadata.attendee_id);
      if (
        metadataAttendeeId &&
        !metadataBelongsToUser(metadataAttendeeId, user.id, attendeeId)
      ) {
        return NextResponse.json({ error: 'Subscription does not belong to this account.' }, { status: 403 });
      }

      const mappedStatus = resolveMappedStatus(readString(latest.status) || 'active');
      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paypal',
        scope: 'attendee_subscription',
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
        cancelAtPeriodEnd: resolveCancelAtPeriodEnd(metadata, manualRenewalMode),
        canceledAt:
          mappedStatus === 'canceled' || mappedStatus === 'cancelled'
            ? new Date().toISOString()
            : null,
        attendeeId,
        planCode: readString(metadata.plan_code),
        metadata: {
          ...metadata,
          verification_source: 'attendee.subscription.verify.api',
          paypal_subscription_status: latest.status || null,
        },
      });
    } else if (provider === 'flutterwave') {
      if (!txRef) {
        return NextResponse.json({ error: 'Flutterwave txRef is required.' }, { status: 400 });
      }

      const verified = await verifyTransactionByRef(txRef);
      if (!isSuccessfulStatus(verified.status)) {
        return NextResponse.json(
          { error: `Flutterwave charge is not successful yet (status: ${verified.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord((verified as any).meta);
      const scope = readString(metadata.subscription_scope);
      if (scope !== 'attendee_subscription') {
        return NextResponse.json(
          { error: 'Transaction is not an attendee subscription payment.' },
          { status: 400 }
        );
      }
      const metadataAttendeeId = readString(metadata.attendee_id);
      if (
        metadataAttendeeId &&
        !metadataBelongsToUser(metadataAttendeeId, user.id, attendeeId)
      ) {
        return NextResponse.json({ error: 'Transaction does not belong to this account.' }, { status: 403 });
      }

      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));
      const mappedStatus = resolveMappedStatus(readString(verified.status));

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'flutterwave',
        scope: 'attendee_subscription',
        status: mappedStatus,
        eventType: 'manual_verify',
        externalSubscriptionId:
          manualRenewalMode
            ? null
            : readString(metadata.subscription_id) ||
              readString(metadata.provider_subscription_id) ||
              txRef,
        externalCustomerId:
          ((verified as any).customer?.id ? String((verified as any).customer.id) : null) ||
          readString((verified as any).customer?.email),
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
        cancelAtPeriodEnd: resolveCancelAtPeriodEnd(metadata, manualRenewalMode),
        canceledAt:
          mappedStatus === 'canceled' || mappedStatus === 'cancelled'
            ? new Date().toISOString()
            : null,
        attendeeId,
        planCode: readString(metadata.plan_code),
        metadata: {
          ...metadata,
          verification_source: 'attendee.subscription.verify.api',
          flutterwave_tx_ref: txRef,
        },
      });
    } else {
      if (!reference) {
        return NextResponse.json({ error: 'Paystack reference is required.' }, { status: 400 });
      }

      const regionHint =
        readString(body?.regionCode) ||
        readString(body?.region) ||
        regionCode;
      const candidateSecretKeys = await resolvePaystackSecretKeyCandidates(regionHint || undefined);
      if (!candidateSecretKeys.length) {
        return NextResponse.json({ error: 'Paystack is not configured.' }, { status: 503 });
      }

      let verified: Awaited<ReturnType<typeof verifyPaystackTransaction>> | null = null;
      let lastPaystackError: unknown = null;
      for (const secretKey of candidateSecretKeys) {
        try {
          verified = await verifyPaystackTransaction(reference, secretKey);
          break;
        } catch (candidateError) {
          lastPaystackError = candidateError;
        }
      }
      if (!verified) {
        throw lastPaystackError || new Error('Failed to verify Paystack transaction');
      }
      if (!isSuccessfulStatus(verified.status)) {
        return NextResponse.json(
          { error: `Payment is not yet successful (status: ${verified.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord(verified.metadata);
      const mergedMetadata = {
        ...latestMetadata,
        ...metadata,
      };
      const scope = readString(mergedMetadata.subscription_scope) || 'attendee_subscription';
      if (scope !== 'attendee_subscription') {
        return NextResponse.json(
          { error: 'Reference is not an attendee subscription payment.' },
          { status: 400 }
        );
      }

      const metadataAttendeeId = readString(mergedMetadata.attendee_id);
      const referenceBelongsToUser = reference.startsWith(`att_sub_${user.id}_`);
      if (
        metadataAttendeeId &&
        !metadataBelongsToUser(metadataAttendeeId, user.id, attendeeId)
      ) {
        return NextResponse.json({ error: 'Payment does not belong to this account.' }, { status: 403 });
      }
      if (!metadataAttendeeId && !referenceBelongsToUser) {
        return NextResponse.json({ error: 'Unable to verify payment ownership.' }, { status: 403 });
      }

      const providerPlanId =
        readString(mergedMetadata.provider_plan_id) ||
        readString((verified as any)?.plan?.plan_code);
      const billingCycle = normalizeBillingCycle(
        readString(mergedMetadata.billing_cycle) ||
          readString((verified as any)?.plan?.interval)
      );
      const renewalMode = readString(mergedMetadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode =
        renewalMode === 'manual_renewal' ||
        readBooleanFlag(mergedMetadata.manual_renewal) === true;
      const currentPeriodEnd =
        readString(mergedMetadata.current_period_end) ||
        (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null);

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paystack',
        scope: 'attendee_subscription',
        status: 'active',
        eventType: 'manual_verify',
        externalSubscriptionId:
          manualRenewalMode
            ? null
            : readString((verified as any)?.subscription?.subscription_code) ||
              readString(mergedMetadata.subscription_id) ||
              reference,
        externalPlanId: providerPlanId,
        billingCycle,
        currency: readString(verified.currency) || readString(mergedMetadata.pricing_currency) || 'USD',
        amountCents:
          readNumber(mergedMetadata.pricing_amount_cents) ??
          (Number.isFinite(Number(verified.amount)) ? Math.round(Number(verified.amount)) : null),
        currentPeriodStart:
          readString(verified.paid_at) ||
          readString((verified as any)?.created_at) ||
          new Date().toISOString(),
        currentPeriodEnd,
        cancelAtPeriodEnd: resolveCancelAtPeriodEnd(mergedMetadata, manualRenewalMode),
        attendeeId,
        planCode: readString(mergedMetadata.plan_code),
        metadata: {
          ...mergedMetadata,
          paystack_reference: reference,
          verification_source: 'attendee.subscription.verify.api',
          renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        },
      });
    }

    const nowIso = new Date().toISOString();
    const { data: subscriptions } = await serviceClient
      .from('attendee_subscriptions')
      .select('id, plan_code, status, current_period_end, cancel_at_period_end, payment_provider')
      .eq('attendee_id', attendeeId)
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
    console.error('Attendee subscription verification error:', error);
    if (error instanceof PaystackApiError) {
      const statusCode = error.statusCode >= 400 && error.statusCode < 500 ? 400 : 502;
      return NextResponse.json(
        {
          error: error.message || 'Paystack verification failed.',
          code: 'paystack_verify_failed',
          failClosed: statusCode >= 500,
        },
        { status: statusCode }
      );
    }
    if (isMissingRelationError(error) || isMissingColumnError(error)) {
      return NextResponse.json(
        {
          error:
            'Billing schema is not aligned with this release. Apply latest migrations and retry verification.',
          code: 'billing_schema_mismatch',
          failClosed: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to verify attendee subscription payment.' },
      { status: 500 }
    );
  }
}

