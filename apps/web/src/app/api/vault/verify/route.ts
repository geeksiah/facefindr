export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { recordSubscriptionChargeJournalFromSourceRef } from '@/lib/payments/financial-flow-ledger';
import { verifyTransactionByRef } from '@/lib/payments/flutterwave';
import { getBillingSubscription } from '@/lib/payments/paypal';
import {
  PaystackApiError,
  resolvePaystackSecretKeyCandidates,
  verifyPaystackTransaction,
} from '@/lib/payments/paystack';
import {
  mapProviderSubscriptionStatusToLocal,
  type RecurringProductScope,
} from '@/lib/payments/recurring-subscriptions';
import { commitPromoRedemption } from '@/lib/promotions/promo-service';
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
  return normalized === 'success' || normalized === 'successful' || normalized === 'completed';
}

function isSuccessfulFlutterwaveStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'success' || normalized === 'successful' || normalized === 'completed';
}

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

function resolveMappedStatus(
  rawStatus: string | null,
  scope: RecurringProductScope,
  fallback: 'active' | 'past_due' = 'active'
) {
  return mapProviderSubscriptionStatusToLocal(rawStatus, scope) || fallback;
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

function extractPromoFromMetadata(metadata: Record<string, unknown>) {
  const promoCodeId = readString(metadata.promo_code_id);
  const discountCents = readNumber(metadata.promo_discount_cents);
  if (!promoCodeId || !discountCents || discountCents <= 0) {
    return null;
  }

  const appliedAmountCents =
    readNumber(metadata.promo_applied_amount_cents) ??
    readNumber(metadata.pricing_amount_before_discount_cents) ??
    readNumber(metadata.pricing_amount_cents) ??
    0;
  const finalAmountCents =
    readNumber(metadata.promo_final_amount_cents) ??
    readNumber(metadata.pricing_amount_cents) ??
    Math.max(0, appliedAmountCents - discountCents);

  return {
    promoCodeId,
    promoCode: readString(metadata.promo_code),
    appliedAmountCents,
    discountCents,
    finalAmountCents,
  };
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

    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').trim().toLowerCase();
    const sessionId = String(body?.sessionId || '').trim();
    const subscriptionId = String(body?.subscriptionId || '').trim();
    const txRef = String(body?.txRef || '').trim();
    const reference = String(body?.reference || '').trim();

    if (!['stripe', 'paypal', 'flutterwave', 'paystack'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported provider for vault verification.' }, { status: 400 });
    }

    const { data: latestSubscription } = await serviceClient
      .from('storage_subscriptions')
      .select('id, plan_id, metadata')
      .eq('user_id', user.id)
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
        return NextResponse.json({ error: 'Stripe session is not a subscription checkout.' }, { status: 400 });
      }
      if (String(session.payment_status || '').toLowerCase() !== 'paid') {
        return NextResponse.json(
          { error: `Stripe checkout is not paid yet (status: ${session.payment_status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const sessionMetadata = parseMetadataRecord(session.metadata);
      const scope = readString(sessionMetadata.subscription_scope) || 'vault_subscription';
      if (scope !== 'vault_subscription') {
        return NextResponse.json({ error: 'Session is not a vault subscription checkout.' }, { status: 400 });
      }
      const metadataUserId = readString(sessionMetadata.user_id);
      if (metadataUserId && metadataUserId !== user.id) {
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
      const mappedStatus = resolveMappedStatus(
        String(stripeSubscription.status || 'active'),
        'vault_subscription'
      );
      const unitAmount = Number(stripeSubscription.items?.data?.[0]?.price?.unit_amount || 0);
      const amountCents =
        readNumber(metadata.pricing_amount_cents) ??
        (Number.isFinite(unitAmount) ? Math.round(unitAmount) : null);

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'stripe',
        scope: 'vault_subscription',
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
        userId: user.id,
        planId: readString(metadata.plan_id) || String(latestSubscription?.plan_id || ''),
        planSlug: readString(metadata.plan_slug) || readString(latestMetadata.plan_slug),
        metadata: {
          ...latestMetadata,
          ...metadata,
          verification_source: 'vault.verify.api',
          stripe_session_id: session.id,
        },
      });

      const promo = extractPromoFromMetadata(metadata);
      if (promo) {
        await commitPromoRedemption({
          supabase: serviceClient,
          userId: user.id,
          scope: 'vault_subscription',
          promoCodeId: promo.promoCodeId,
          promoCode: promo.promoCode,
          appliedAmountCents: promo.appliedAmountCents,
          discountCents: promo.discountCents,
          finalAmountCents: promo.finalAmountCents,
          currency:
            readString(stripeSubscription.items?.data?.[0]?.price?.currency)?.toUpperCase() ||
            readString(metadata.pricing_currency) ||
            'USD',
          planReference: readString(metadata.plan_slug),
          sourceRef: String(stripeSubscription.id),
          metadata: {
            provider: 'stripe',
            provider_session_id: session.id,
          },
        }).catch((promoError) => {
          console.error('[PROMO] failed to commit vault promo redemption (stripe):', promoError);
        });
      }
    } else if (provider === 'paypal') {
      if (!subscriptionId) {
        return NextResponse.json({ error: 'PayPal subscriptionId is required.' }, { status: 400 });
      }

      const latest = await getBillingSubscription(subscriptionId);
      const metadata = parseMetadataRecord(latest?.custom_id);
      const scope = readString(metadata.subscription_scope);
      if (scope !== 'vault_subscription') {
        return NextResponse.json({ error: 'Subscription is not a vault subscription.' }, { status: 400 });
      }
      const metadataUserId = readString(metadata.user_id);
      if (metadataUserId && metadataUserId !== user.id) {
        return NextResponse.json({ error: 'Subscription does not belong to this account.' }, { status: 403 });
      }

      const mappedStatus = resolveMappedStatus(
        readString(latest.status) || 'active',
        'vault_subscription'
      );
      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paypal',
        scope: 'vault_subscription',
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
          mappedStatus === 'cancelled' ? new Date().toISOString() : null,
        userId: user.id,
        planId: readString(metadata.plan_id) || String(latestSubscription?.plan_id || ''),
        planSlug: readString(metadata.plan_slug) || readString(latestMetadata.plan_slug),
        metadata: {
          ...latestMetadata,
          ...metadata,
          verification_source: 'vault.verify.api',
          paypal_subscription_status: latest.status || null,
        },
      });

      const promo = extractPromoFromMetadata(metadata);
      if (promo) {
        await commitPromoRedemption({
          supabase: serviceClient,
          userId: user.id,
          scope: 'vault_subscription',
          promoCodeId: promo.promoCodeId,
          promoCode: promo.promoCode,
          appliedAmountCents: promo.appliedAmountCents,
          discountCents: promo.discountCents,
          finalAmountCents: promo.finalAmountCents,
          currency: readString(metadata.pricing_currency) || 'USD',
          planReference: readString(metadata.plan_slug),
          sourceRef: String(latest.id || subscriptionId),
          metadata: {
            provider: 'paypal',
          },
        }).catch((promoError) => {
          console.error('[PROMO] failed to commit vault promo redemption (paypal):', promoError);
        });
      }
    } else if (provider === 'flutterwave') {
      if (!txRef) {
        return NextResponse.json({ error: 'Flutterwave txRef is required.' }, { status: 400 });
      }

      const verified = await verifyTransactionByRef(txRef);
      if (!isSuccessfulFlutterwaveStatus(verified.status)) {
        return NextResponse.json(
          { error: `Flutterwave charge is not successful yet (status: ${verified.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord((verified as any).meta);
      const scope = readString(metadata.subscription_scope);
      if (scope !== 'vault_subscription') {
        return NextResponse.json({ error: 'Transaction is not a vault subscription payment.' }, { status: 400 });
      }
      const metadataUserId = readString(metadata.user_id);
      if (metadataUserId && metadataUserId !== user.id) {
        return NextResponse.json({ error: 'Transaction does not belong to this account.' }, { status: 403 });
      }

      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode = renewalMode === 'manual_renewal';
      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));
      const mappedStatus = resolveMappedStatus(readString(verified.status), 'vault_subscription');
      const chargeAmountCents =
        readNumber(metadata.pricing_amount_cents) ||
        parseMinorAmountFromMajor((verified as any).charged_amount) ||
        parseMinorAmountFromMajor((verified as any).amount);
      const chargeCurrency =
        readString(verified.currency) || readString(metadata.pricing_currency) || 'USD';

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'flutterwave',
        scope: 'vault_subscription',
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
        currency: chargeCurrency,
        amountCents: chargeAmountCents,
        currentPeriodStart: readString((verified as any).charged_at) || new Date().toISOString(),
        currentPeriodEnd:
          readString(metadata.current_period_end) ||
          (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null),
        cancelAtPeriodEnd: resolveCancelAtPeriodEnd(metadata, manualRenewalMode),
        canceledAt:
          mappedStatus === 'cancelled' ? new Date().toISOString() : null,
        userId: user.id,
        planId: readString(metadata.plan_id) || String(latestSubscription?.plan_id || ''),
        planSlug: readString(metadata.plan_slug) || readString(latestMetadata.plan_slug),
        metadata: {
          ...latestMetadata,
          ...metadata,
          verification_source: 'vault.verify.api',
          flutterwave_tx_ref: txRef,
        },
      });

      await recordSubscriptionChargeJournalFromSourceRef(serviceClient, {
        scope: 'vault_subscription',
        sourceRef: txRef,
        amountMinor: chargeAmountCents,
        currency: chargeCurrency,
        provider: 'flutterwave',
        metadata: {
          verification_source: 'vault.verify.api',
          flutterwave_tx_ref: txRef,
          user_id: user.id,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record vault subscription charge on verify:', ledgerError);
      });

      const promo = extractPromoFromMetadata(metadata);
      if (promo) {
        await commitPromoRedemption({
          supabase: serviceClient,
          userId: user.id,
          scope: 'vault_subscription',
          promoCodeId: promo.promoCodeId,
          promoCode: promo.promoCode,
          appliedAmountCents: promo.appliedAmountCents,
          discountCents: promo.discountCents,
          finalAmountCents: promo.finalAmountCents,
          currency: chargeCurrency,
          planReference: readString(metadata.plan_slug),
          sourceRef: txRef,
          metadata: {
            provider: 'flutterwave',
          },
        }).catch((promoError) => {
          console.error('[PROMO] failed to commit vault promo redemption (flutterwave):', promoError);
        });
      }
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

      if (!isSuccessfulPaystackStatus(verified.status)) {
        return NextResponse.json(
          { error: `Payment is not yet successful (status: ${verified.status || 'unknown'}).` },
          { status: 400 }
        );
      }

      const metadata = parseMetadataRecord(verified.metadata);
      const scope = readString(metadata.subscription_scope) || 'vault_subscription';
      if (scope !== 'vault_subscription') {
        return NextResponse.json({ error: 'Reference is not a vault subscription payment.' }, { status: 400 });
      }

      const metadataUserId = readString(metadata.user_id);
      if (metadataUserId && metadataUserId !== user.id) {
        return NextResponse.json({ error: 'Payment does not belong to this account.' }, { status: 403 });
      }

      const billingCycle = normalizeBillingCycle(readString(metadata.billing_cycle));
      const renewalMode = readString(metadata.renewal_mode) || 'provider_recurring';
      const manualRenewalMode =
        renewalMode === 'manual_renewal' ||
        readBooleanFlag(metadata.manual_renewal) === true;
      const amountCents =
        readNumber(metadata.pricing_amount_cents) ??
        (Number.isFinite(Number(verified.amount)) ? Math.round(Number(verified.amount)) : null);
      const chargeCurrency =
        readString(verified.currency) || readString(metadata.pricing_currency) || 'USD';

      await syncRecurringSubscriptionRecord({
        supabase: serviceClient,
        provider: 'paystack',
        scope: 'vault_subscription',
        status: 'active',
        eventType: 'manual_verify',
        externalSubscriptionId:
          manualRenewalMode ? null : readString(metadata.subscription_id) || reference,
        externalPlanId: readString(metadata.provider_plan_id),
        billingCycle,
        currency: chargeCurrency,
        amountCents,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd:
          readString(metadata.current_period_end) ||
          (manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null),
        cancelAtPeriodEnd: resolveCancelAtPeriodEnd(metadata, manualRenewalMode),
        userId: user.id,
        planId: readString(metadata.plan_id) || String(latestSubscription?.plan_id || ''),
        planSlug: readString(metadata.plan_slug) || readString(latestMetadata.plan_slug),
        metadata: {
          ...latestMetadata,
          ...metadata,
          paystack_reference: reference,
          verification_source: 'vault.verify.api',
          renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        },
      });

      await recordSubscriptionChargeJournalFromSourceRef(serviceClient, {
        scope: 'vault_subscription',
        sourceRef: reference,
        amountMinor: amountCents,
        currency: chargeCurrency,
        provider: 'paystack',
        metadata: {
          verification_source: 'vault.verify.api',
          paystack_reference: reference,
          user_id: user.id,
        },
      }).catch((ledgerError) => {
        console.error('[LEDGER] failed to record vault subscription charge on verify:', ledgerError);
      });

      const promo = extractPromoFromMetadata(metadata);
      if (promo) {
        await commitPromoRedemption({
          supabase: serviceClient,
          userId: user.id,
          scope: 'vault_subscription',
          promoCodeId: promo.promoCodeId,
          promoCode: promo.promoCode,
          appliedAmountCents: promo.appliedAmountCents,
          discountCents: promo.discountCents,
          finalAmountCents: promo.finalAmountCents,
          currency: chargeCurrency,
          planReference: readString(metadata.plan_slug),
          sourceRef: reference,
          metadata: {
            provider: 'paystack',
          },
        }).catch((promoError) => {
          console.error('[PROMO] failed to commit vault promo redemption (paystack):', promoError);
        });
      }
    }

    const { data: subscription } = await serviceClient
      .from('storage_subscriptions')
      .select('status, plan_id, billing_cycle, current_period_end, payment_provider')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      subscription: subscription || null,
      provider,
    });
  } catch (error: any) {
    console.error('Vault payment verification error:', error);
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
    return NextResponse.json(
      { error: error?.message || 'Failed to verify vault payment.' },
      { status: 500 }
    );
  }
}
