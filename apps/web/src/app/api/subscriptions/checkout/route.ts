export const dynamic = 'force-dynamic';

/**
 * Subscription Checkout API
 * 
 * Create checkout session for subscription upgrade.
 */

import { createHash } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency';
import { getAppUrl } from '@/lib/env';
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
  PaystackApiError,
  resolvePaystackPublicKey,
  resolvePaystackSecretKey,
} from '@/lib/payments/paystack';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import {
  resolveProviderPlanMapping,
} from '@/lib/payments/recurring-subscriptions';
import { stripe } from '@/lib/payments/stripe';
import { getPlanByCode } from '@/lib/subscription';
import { resolvePlanPriceForCurrency } from '@/lib/subscription/price-resolution';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const IDEMPOTENCY_DEPRECATION_WARNING =
  '299 - "idempotencyKey in request body is deprecated; send Idempotency-Key header instead."';
const PAYSTACK_MANUAL_RENEWAL_FALLBACK_ENABLED =
  process.env.ENABLE_PAYSTACK_MANUAL_RENEWAL_FALLBACK !== 'false';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
}

function buildRequestHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function readMetadataBoolean(metadata: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = metadata?.[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

function readMetadataNumber(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = metadata?.[key];
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isTrialCompatibleMapping(params: {
  mapping: {
    provider: 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
    metadata: Record<string, unknown> | null;
  } | null;
  trialDurationDays: number;
  trialAutoBillEnabled: boolean;
}): boolean {
  const { mapping, trialDurationDays, trialAutoBillEnabled } = params;
  if (!mapping) return false;
  if (mapping.provider === 'stripe') return true;

  const metadata = mapping.metadata || {};
  const trialSupported = readMetadataBoolean(metadata, 'trial_supported');
  if (!trialSupported) return false;

  const isFlexibleDuration = readMetadataBoolean(metadata, 'trial_duration_flexible');
  const mappedTrialDuration = readMetadataNumber(metadata, 'trial_duration_days');
  if (!isFlexibleDuration && mappedTrialDuration !== null && mappedTrialDuration !== trialDurationDays) {
    return false;
  }

  if (!trialAutoBillEnabled) {
    const supportsAutoBillOff = readMetadataBoolean(metadata, 'trial_auto_bill_off_supported');
    if (!supportsAutoBillOff) return false;
  }

  return true;
}

function isMissingRelationError(error: unknown, relationName?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  const isPostgresMissingRelation = code === '42P01';
  const isPostgrestSchemaMissingRelation =
    code === 'PGRST205' &&
    message.includes('schema cache') &&
    message.includes('could not find the table');
  if (!isPostgresMissingRelation && !isPostgrestSchemaMissingRelation) return false;
  if (!relationName) return true;
  const normalized = relationName.toLowerCase();
  return (
    message.includes(normalized) ||
    message.includes(`public.${normalized}`) ||
    message.includes(`'${normalized}'`)
  );
}

function isMissingColumnError(error: unknown, columnName?: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  if (code !== '42703') return false;
  if (!columnName) return true;
  return message.includes(columnName.toLowerCase());
}

function isSchemaCacheColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as any).code || '');
  const message = String((error as any).message || '').toLowerCase();
  return code.startsWith('PGRST') && message.includes('schema cache') && message.includes('column');
}

function getManualPeriodEndIso(billingCycle: 'monthly' | 'annual'): string {
  const now = Date.now();
  const durationMs =
    billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return new Date(now + durationMs).toISOString();
}

export async function POST(request: NextRequest) {
  let idempotencyFinalizeRef:
    | ((
        status: 'completed' | 'failed',
        responseCode: number,
        payload: Record<string, unknown>
      ) => Promise<void>)
    | null = null;
  let responseHeaders: HeadersInit = {};
  let trialClaimDeleteKey: string | null = null;
  let trialCheckoutSessionCreated = false;

  try {
    const appUrl = getAppUrl();

    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

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
    const creatorId = creatorProfile.id as string;
    const normalizedEmail = String(user.email || '').trim().toLowerCase();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const {
      planCode,
      billingCycle = 'monthly',
      currency: requestedCurrency,
      idempotencyKey: bodyIdempotencyKey,
    } = body;
    const headerIdempotencyKey =
      request.headers.get('Idempotency-Key') || request.headers.get('idempotency-key');

    if (headerIdempotencyKey && bodyIdempotencyKey && headerIdempotencyKey !== bodyIdempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency key mismatch between header and body' },
        { status: 400 }
      );
    }

    const idempotencyKey = String(headerIdempotencyKey || bodyIdempotencyKey || '').trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency key is required via Idempotency-Key header' },
        { status: 400 }
      );
    }

    if (!headerIdempotencyKey && bodyIdempotencyKey) {
      responseHeaders = {
        Warning: IDEMPOTENCY_DEPRECATION_WARNING,
        'X-Idempotency-Key-Deprecated': 'true',
      };
    }

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

    const paymentChannel: 'auto' = 'auto';

    const operationScope = 'subscription.checkout.create';
    const requestHash = buildRequestHash({
      planCode,
      billingCycle,
      currency: requestedCurrency || null,
      paymentChannel,
      actorId: user.id,
    });
    let idempotencyRecordId: string | null = null;
    let idempotencyFinalized = false;
    const claimTimestamp = new Date().toISOString();

    const finalizeIdempotency = async (
      status: 'completed' | 'failed',
      responseCode: number,
      payload: Record<string, unknown>
    ) => {
      if (!idempotencyRecordId || idempotencyFinalized) return;
      idempotencyFinalized = true;
      try {
        await serviceClient
          .from('api_idempotency_keys')
          .update({
            status,
            response_code: responseCode,
            response_payload: status === 'completed' ? payload : null,
            error_payload: status === 'failed' ? payload : null,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', idempotencyRecordId);
      } catch (error) {
        console.error('Failed to finalize idempotency record:', error);
      }
    };
    idempotencyFinalizeRef = finalizeIdempotency;

    const respond = async (
      payload: Record<string, unknown>,
      responseCode: number,
      status?: 'completed' | 'failed'
    ) => {
      const enriched = {
        ...payload,
        idempotencyKey,
        replayed: false,
      };
      if (status) {
        await finalizeIdempotency(status, responseCode, enriched);
      }
      return NextResponse.json(enriched, { status: responseCode, headers: responseHeaders });
    };

    const { data: claimedIdempotency, error: claimError } = await serviceClient
      .from('api_idempotency_keys')
      .insert({
        operation_scope: operationScope,
        actor_id: user.id,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        status: 'processing',
        last_seen_at: claimTimestamp,
      })
      .select('id')
      .single();

    if (claimError) {
      if (isMissingRelationError(claimError, 'api_idempotency_keys') || isMissingColumnError(claimError)) {
        return NextResponse.json(
          {
            error:
              'Idempotency storage is not available. Run latest billing migrations before retrying checkout.',
            code: 'idempotency_table_missing',
            failClosed: true,
            idempotencyKey,
            replayed: false,
          },
          { status: 503, headers: responseHeaders }
        );
      }
      if (claimError.code !== '23505') {
        throw claimError;
      }

      const { data: existingIdempotency, error: existingIdempotencyError } = await serviceClient
        .from('api_idempotency_keys')
        .select('*')
        .eq('operation_scope', operationScope)
        .eq('actor_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (
        existingIdempotencyError &&
        (isMissingRelationError(existingIdempotencyError, 'api_idempotency_keys') ||
          isMissingColumnError(existingIdempotencyError) ||
          isSchemaCacheColumnError(existingIdempotencyError))
      ) {
        return NextResponse.json(
          {
            error:
              'Idempotency storage is not available. Run latest billing migrations before retrying checkout.',
            code: 'idempotency_table_missing',
            failClosed: true,
            idempotencyKey,
            replayed: false,
          },
          { status: 503, headers: responseHeaders }
        );
      }
      if (existingIdempotencyError) {
        throw existingIdempotencyError;
      }

      if (!existingIdempotency) {
        return NextResponse.json(
          {
            error: 'Checkout request is already being processed with this idempotency key',
            idempotencyKey,
            replayed: false,
          },
          { status: 409, headers: responseHeaders }
        );
      }

      await serviceClient
        .from('api_idempotency_keys')
        .update({ last_seen_at: claimTimestamp })
        .eq('id', existingIdempotency.id);

      if (existingIdempotency.request_hash !== requestHash) {
        return NextResponse.json(
          {
            error: 'Idempotency key was already used with a different request payload',
            idempotencyKey,
            replayed: false,
          },
          { status: 409, headers: responseHeaders }
        );
      }

      if (existingIdempotency.status === 'completed' && existingIdempotency.response_payload) {
        const headers = { ...responseHeaders, 'Idempotency-Replayed': 'true' };
        return NextResponse.json(existingIdempotency.response_payload as Record<string, unknown>, {
          status: existingIdempotency.response_code || 200,
          headers,
        });
      }

      if (existingIdempotency.status === 'failed' && existingIdempotency.error_payload) {
        const headers = { ...responseHeaders, 'Idempotency-Replayed': 'true' };
        return NextResponse.json(existingIdempotency.error_payload as Record<string, unknown>, {
          status: existingIdempotency.response_code || 400,
          headers,
        });
      }

      return NextResponse.json(
        {
          error: 'Checkout request is already being processed with this idempotency key',
          idempotencyKey,
          replayed: false,
        },
        { status: 409, headers: responseHeaders }
      );
    }

    if (!claimedIdempotency?.id) {
      return NextResponse.json(
        {
          error: 'Failed to acquire idempotency lock for checkout.',
          code: 'idempotency_claim_failed',
          failClosed: true,
          idempotencyKey,
          replayed: false,
        },
        { status: 503, headers: responseHeaders }
      );
    }

    idempotencyRecordId = claimedIdempotency.id;

    // Fail-closed to admin-managed plan configuration
    const plan = await getPlanByCode(planCode, 'creator');
    if (!plan || !plan.isActive || plan.planType !== 'creator') {
      return respond(
        { error: 'Plan is not available for creator subscriptions', failClosed: true },
        503,
        'failed'
      );
    }
    const trialEnabled = Boolean((plan as any).trialEnabled);
    const trialDurationDays = Math.max(1, Math.min(30, Number((plan as any).trialDurationDays || 14)));
    const trialFeaturePolicy =
      String((plan as any).trialFeaturePolicy || 'full_plan_access') === 'free_plan_limits'
        ? 'free_plan_limits'
        : 'full_plan_access';
    const trialAutoBillEnabled = Boolean((plan as any).trialAutoBillEnabled ?? true);
    const { data: subscriptionSettings } = await serviceClient
      .from('subscription_settings')
      .select('auto_renew')
      .eq('user_id', user.id)
      .maybeSingle();
    const autoRenewPreference = subscriptionSettings?.auto_renew !== false;
    let trialAlreadyRedeemed = false;
    if (trialEnabled) {
      if (!normalizedEmail) {
        return respond(
          {
            error: 'A verified email is required before starting a trial',
            code: 'trial_email_required',
          },
          400,
          'failed'
        );
      }
      const { data: existingTrialByEmail, error: existingTrialLookupError } = await serviceClient
        .from('subscription_trial_redemptions')
        .select('id')
        .eq('email_normalized', normalizedEmail)
        .maybeSingle();
      if (
        existingTrialLookupError &&
        (isMissingRelationError(existingTrialLookupError, 'subscription_trial_redemptions') ||
          isMissingColumnError(existingTrialLookupError))
      ) {
        return respond(
          {
            error:
              'Trial controls are enabled but trial storage is missing. Apply latest migrations and retry.',
            code: 'trial_table_missing',
            failClosed: true,
          },
          503,
          'failed'
        );
      }
      trialAlreadyRedeemed = Boolean(existingTrialByEmail?.id);
    }

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const fallbackCurrency = await getEffectiveCurrency(user.id, detectedCountry);
    const normalizedCurrency = String(requestedCurrency || fallbackCurrency || 'USD').toUpperCase();

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
        return respond(
          {
            error: gatewayError.message,
            failClosed: gatewayError.failClosed,
            code: gatewayError.code,
          },
          503,
          'failed'
        );
      }
      throw gatewayError;
    }

    const configuredGateways = Array.from(
      new Set([gatewaySelection.gateway, ...(gatewaySelection.availableGateways || [])])
    );
    const trialRequested = trialEnabled && !trialAlreadyRedeemed;
    const mappingCache = new Map<string, Awaited<ReturnType<typeof resolveProviderPlanMapping>>>();
    const loadMappingForGateway = async (
      gateway: 'stripe' | 'paypal' | 'flutterwave' | 'paystack'
    ) => {
      const cacheKey = `${gateway}:${billingCycle}:${normalizedCurrency}:${gatewaySelection.countryCode || 'GLOBAL'}`;
      if (mappingCache.has(cacheKey)) {
        return mappingCache.get(cacheKey) || null;
      }
      const resolved = await resolveProviderPlanMapping({
        productScope: 'creator_subscription',
        internalPlanCode: plan.code,
        provider: gateway,
        billingCycle,
        currency: normalizedCurrency,
        regionCode: gatewaySelection.countryCode,
        allowCurrencyFallback: true,
      });
      mappingCache.set(cacheKey, resolved);
      return resolved;
    };

    let selectedGateway: 'stripe' | 'paypal' | 'flutterwave' | 'paystack' = gatewaySelection.gateway;
    let mapping = await loadMappingForGateway(selectedGateway);

    const isGatewayUsable = (candidateGateway: 'stripe' | 'paypal' | 'flutterwave' | 'paystack', candidateMapping: any) => {
      if (!trialRequested) {
        if (candidateGateway === 'stripe') {
          return Boolean(stripe);
        }
        if (candidateGateway === 'paystack') {
          if (candidateMapping) return true;
          return PAYSTACK_MANUAL_RENEWAL_FALLBACK_ENABLED;
        }
        return Boolean(candidateMapping);
      }

      if (candidateGateway === 'stripe') {
        if (!stripe) return false;
        if (!trialAutoBillEnabled) return true;
        return true;
      }
      return isTrialCompatibleMapping({
        mapping: candidateMapping,
        trialDurationDays,
        trialAutoBillEnabled,
      });
    };

    let paystackSecretKeyCache: string | null | undefined;
    const getPaystackSecretForRegion = async () => {
      if (paystackSecretKeyCache !== undefined) return paystackSecretKeyCache;
      paystackSecretKeyCache = await resolvePaystackSecretKey(gatewaySelection.countryCode);
      return paystackSecretKeyCache;
    };

    const isGatewayRuntimeConfigured = async (
      candidateGateway: 'stripe' | 'paypal' | 'flutterwave' | 'paystack'
    ) => {
      if (candidateGateway === 'stripe') return Boolean(stripe);
      if (candidateGateway === 'paypal') return isPayPalConfigured();
      if (candidateGateway === 'flutterwave') return isFlutterwaveConfigured();
      return Boolean(await getPaystackSecretForRegion());
    };

    const pickFallbackGateway = async (
      exclude: 'stripe' | 'paypal' | 'flutterwave' | 'paystack'
    ) => {
      for (const candidate of configuredGateways) {
        if (candidate === exclude) continue;
        const candidateGateway = candidate as 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
        const candidateMapping = await loadMappingForGateway(candidateGateway);
        if (!isGatewayUsable(candidateGateway, candidateMapping)) {
          continue;
        }
        if (!(await isGatewayRuntimeConfigured(candidateGateway))) {
          continue;
        }
        return {
          gateway: candidateGateway,
          mapping: candidateMapping,
        };
      }
      return null;
    };

    if (!isGatewayUsable(selectedGateway, mapping)) {
      let resolvedGateway: 'stripe' | 'paypal' | 'flutterwave' | 'paystack' | null = null;
      let resolvedMapping: any = null;

      for (const candidate of configuredGateways) {
        if (candidate === selectedGateway) continue;
        const candidateGateway = candidate as 'stripe' | 'paypal' | 'flutterwave' | 'paystack';
        const candidateMapping = await loadMappingForGateway(candidateGateway);
        if (isGatewayUsable(candidateGateway, candidateMapping)) {
          resolvedGateway = candidateGateway;
          resolvedMapping = candidateMapping;
          break;
        }
      }

      if (!resolvedGateway) {
        if (trialRequested) {
          return respond(
            {
              error:
                `Trial checkout is not configured for available gateways (${configuredGateways.join(', ')}).` +
                ' Configure provider_plan_mappings.metadata with trial_supported=true and matching trial constraints.',
              code: 'trial_gateway_unsupported',
              failClosed: true,
            },
            503,
            'failed'
          );
        }

        return respond(
          {
            error: `Recurring mapping missing for available gateways (${configuredGateways.join(', ')}) on ${plan.code}/${billingCycle}/${normalizedCurrency}`,
            failClosed: true,
            code: 'missing_provider_plan_mapping',
          },
          503,
          'failed'
        );
      }

      selectedGateway = resolvedGateway;
      mapping = resolvedMapping;
    }
    if (!(await isGatewayRuntimeConfigured(selectedGateway))) {
      const fallback = await pickFallbackGateway(selectedGateway);
      if (!fallback) {
        return respond(
          {
            error:
              `The selected gateway (${selectedGateway}) is not configured and no fallback gateway is available.`,
            code: 'gateway_not_configured',
            failClosed: true,
          },
          503,
          'failed'
        );
      }
      selectedGateway = fallback.gateway;
      mapping = fallback.mapping;
    }

    const checkoutCurrency = String(mapping?.currency || normalizedCurrency).toUpperCase();
    const resolvedPrice = await resolvePlanPriceForCurrency(plan, checkoutCurrency);
    const checkoutAmountInCents = Number(resolvedPrice?.amountCents || 0);
    if (!Number.isFinite(checkoutAmountInCents) || checkoutAmountInCents <= 0) {
      return respond(
        {
          error: `Plan pricing is not configured for ${checkoutCurrency}`,
          failClosed: true,
        },
        503,
        'failed'
      );
    }

    let trialApplied = false;
    if (trialRequested) {
      const { data: trialInsert, error: trialInsertError } = await serviceClient
        .from('subscription_trial_redemptions')
        .insert({
          email_normalized: normalizedEmail,
          user_id: user.id,
          plan_id: plan.id,
          plan_code: plan.code,
          checkout_idempotency_key: idempotencyKey,
          metadata: {
            gateway: selectedGateway,
            currency: checkoutCurrency,
            billing_cycle: billingCycle,
            trial_duration_days: trialDurationDays,
            trial_auto_bill_enabled: trialAutoBillEnabled,
          },
        })
        .select('id')
        .single();

      if (trialInsertError) {
        if (trialInsertError.code === '23505') {
          trialAlreadyRedeemed = true;
          trialApplied = false;
        } else if (
          isMissingRelationError(trialInsertError, 'subscription_trial_redemptions') ||
          isMissingColumnError(trialInsertError)
        ) {
          return respond(
            {
              error:
                'Trial controls are enabled but trial storage is missing. Apply latest migrations and retry.',
              code: 'trial_table_missing',
              failClosed: true,
            },
            503,
            'failed'
          );
        } else {
          throw trialInsertError;
        }
      } else if (trialInsert?.id) {
        trialApplied = true;
        trialClaimDeleteKey = idempotencyKey;
      }
    }

    // Handle Stripe
    if (selectedGateway === 'stripe') {
      if (!stripe) {
        return respond(
          { error: 'Stripe not configured' },
          500,
          'failed'
        );
      }

      // Get or create Stripe customer
      const { data: photographer } = await serviceClient
        .from('photographers')
        .select('stripe_customer_id, email')
        .eq('id', creatorId)
        .single();

      let customerId = photographer?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            photographer_id: creatorId,
          },
        });

        customerId = customer.id;

        await serviceClient
          .from('photographers')
          .update({ stripe_customer_id: customerId })
          .eq('id', creatorId);
      }

      const trialCancelAtUnix =
        trialApplied && !trialAutoBillEnabled
          ? Math.floor(Date.now() / 1000) + trialDurationDays * 24 * 60 * 60
          : null;

      const lineItems: any[] = [];
      const useMappedStripePrice = Boolean(mapping?.provider_plan_id?.startsWith('price_'));
      if (useMappedStripePrice) {
        lineItems.push({
          price: mapping!.provider_plan_id,
          quantity: 1,
        });
      } else {
        lineItems.push({
          price_data: {
            currency: checkoutCurrency.toLowerCase(),
            unit_amount: Math.round(checkoutAmountInCents),
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
        });
      }
      const buildSessionPayload = (
        pricingCurrency: string,
        amountCents: number,
        options?: { mappedStripePrice?: boolean; providerPlanId?: string }
      ) => ({
        customer: customerId,
        mode: 'subscription' as const,
        line_items: options?.mappedStripePrice
          ? (lineItems as any)
          : ([
              {
                price_data: {
                  currency: pricingCurrency.toLowerCase(),
                  unit_amount: Math.round(amountCents),
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
            ] as any),
        success_url: `${appUrl}/dashboard/billing?success=true&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/billing?canceled=true&provider=stripe`,
        subscription_data: {
          ...(trialApplied ? { trial_period_days: trialDurationDays } : {}),
          ...(trialCancelAtUnix ? { cancel_at: trialCancelAtUnix } : {}),
          ...(!autoRenewPreference && !trialCancelAtUnix ? { cancel_at_period_end: true } : {}),
          metadata: {
            photographer_id: creatorId,
            subscription_scope: 'creator_subscription',
            plan_code: plan.code,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            pricing_currency: pricingCurrency,
            pricing_amount_cents: String(Math.round(amountCents)),
            provider_plan_id: options?.providerPlanId || 'dynamic',
            auto_renew_preference: autoRenewPreference ? 'true' : 'false',
            trial_applied: trialApplied ? 'true' : 'false',
            trial_feature_policy: trialApplied ? trialFeaturePolicy : null,
            trial_auto_bill_enabled: trialApplied ? (trialAutoBillEnabled ? 'true' : 'false') : null,
            trial_duration_days: trialApplied ? String(trialDurationDays) : null,
          },
        },
        metadata: {
          photographer_id: creatorId,
          subscription_scope: 'creator_subscription',
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: pricingCurrency,
          pricing_amount_cents: String(Math.round(amountCents)),
          provider_plan_id: options?.providerPlanId || 'dynamic',
          auto_renew_preference: autoRenewPreference ? 'true' : 'false',
          trial_applied: trialApplied ? 'true' : 'false',
          trial_feature_policy: trialApplied ? trialFeaturePolicy : null,
          trial_auto_bill_enabled: trialApplied ? (trialAutoBillEnabled ? 'true' : 'false') : null,
          trial_duration_days: trialApplied ? String(trialDurationDays) : null,
        },
      });

      let session;
      let effectiveStripeCurrency = checkoutCurrency;
      let effectiveStripeAmount = Math.round(checkoutAmountInCents);
      let effectiveProviderPlanId = mapping?.provider_plan_id || 'dynamic';

      try {
        session = await stripe.checkout.sessions.create(
          buildSessionPayload(checkoutCurrency, checkoutAmountInCents, {
            mappedStripePrice: useMappedStripePrice,
            providerPlanId: mapping?.provider_plan_id || 'dynamic',
          })
        );
      } catch (stripeError) {
        let recovered = false;

        if (useMappedStripePrice) {
          try {
            session = await stripe.checkout.sessions.create(
              buildSessionPayload(checkoutCurrency, checkoutAmountInCents, {
                mappedStripePrice: false,
                providerPlanId: 'dynamic',
              })
            );
            recovered = true;
            effectiveProviderPlanId = 'dynamic';
          } catch (fallbackError) {
            console.warn('Stripe mapped price checkout failed; dynamic fallback also failed.', fallbackError);
          }
        }

        const resolvedUsd = await resolvePlanPriceForCurrency(plan, 'USD');
        const usdAmount = Number(resolvedUsd?.amountCents || 0);
        const shouldRetryInUsd =
          !recovered &&
          checkoutCurrency !== 'USD' &&
          Number.isFinite(usdAmount) &&
          usdAmount > 0;

        if (!shouldRetryInUsd) {
          throw stripeError;
        }

        session = await stripe.checkout.sessions.create(
          buildSessionPayload('USD', usdAmount, {
            mappedStripePrice: false,
            providerPlanId: 'dynamic',
          })
        );
        effectiveStripeCurrency = 'USD';
        effectiveStripeAmount = Math.round(usdAmount);
        effectiveProviderPlanId = 'dynamic';
      }
      trialCheckoutSessionCreated = true;

      return respond({
        checkoutUrl: session.url,
        sessionId: session.id,
        gateway: selectedGateway,
        pricingCurrency: effectiveStripeCurrency,
        pricingAmountCents: effectiveStripeAmount,
        providerPlanId: effectiveProviderPlanId,
        trialApplied,
        trialAlreadyRedeemed,
        trialDurationDays: trialApplied ? trialDurationDays : 0,
        trialAutoBillEnabled: trialApplied ? trialAutoBillEnabled : true,
        trialFeaturePolicy: trialApplied ? trialFeaturePolicy : null,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'paypal') {
      if (!mapping) {
        return respond(
          { error: 'Recurring mapping missing for PayPal plan', code: 'missing_provider_plan_mapping' },
          503,
          'failed'
        );
      }
      if (!isPayPalConfigured()) {
        return respond({ error: 'PayPal is not configured' }, 500, 'failed');
      }

      const customPayload = JSON.stringify({
        subscription_scope: 'creator_subscription',
        photographer_id: creatorId,
        plan_code: plan.code,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        pricing_currency: checkoutCurrency,
        pricing_amount_cents: Math.round(checkoutAmountInCents),
        auto_renew_preference: autoRenewPreference ? 'true' : 'false',
        trial_applied: trialApplied,
        trial_duration_days: trialApplied ? trialDurationDays : 0,
        trial_feature_policy: trialApplied ? trialFeaturePolicy : null,
        trial_auto_bill_enabled: trialApplied ? trialAutoBillEnabled : true,
      });

      const subscription = await createBillingSubscription({
        planId: mapping.provider_plan_id,
        returnUrl: `${appUrl}/dashboard/billing?success=true&provider=paypal&subscription_id={subscription_id}`,
        cancelUrl: `${appUrl}/dashboard/billing?canceled=true&provider=paypal`,
        customId: customPayload,
        subscriber: {
          email: user.email || undefined,
        },
      });

      const approvalUrl = getApprovalUrl(subscription as any);
      if (!approvalUrl) {
        return respond(
          { error: 'Failed to create PayPal approval URL' },
          500,
          'failed'
        );
      }
      trialCheckoutSessionCreated = true;

      return respond({
        checkoutUrl: approvalUrl,
        sessionId: subscription.id,
        gateway: selectedGateway,
        trialApplied,
        trialAlreadyRedeemed,
        trialDurationDays: trialApplied ? trialDurationDays : 0,
        trialAutoBillEnabled: trialApplied ? trialAutoBillEnabled : true,
        trialFeaturePolicy: trialApplied ? trialFeaturePolicy : null,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'flutterwave') {
      if (!mapping) {
        return respond(
          { error: 'Recurring mapping missing for Flutterwave plan', code: 'missing_provider_plan_mapping' },
          503,
          'failed'
        );
      }
      if (!isFlutterwaveConfigured()) {
        return respond({ error: 'Flutterwave is not configured' }, 500, 'failed');
      }

      const txRef = `sub_${creatorId}_${Date.now()}`;
      const payment = await initializeRecurringPayment({
        txRef,
        amount: Math.round(checkoutAmountInCents),
        currency: checkoutCurrency,
        redirectUrl: `${appUrl}/dashboard/billing?success=true&provider=flutterwave&tx_ref=${encodeURIComponent(txRef)}`,
        customerEmail: user.email || '',
        paymentPlanId: mapping.provider_plan_id,
        metadata: {
          subscription_scope: 'creator_subscription',
          photographer_id: creatorId,
          plan_code: plan.code,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          pricing_currency: checkoutCurrency,
          pricing_amount_cents: String(Math.round(checkoutAmountInCents)),
          auto_renew_preference: autoRenewPreference ? 'true' : 'false',
          trial_applied: trialApplied ? 'true' : 'false',
          ...(trialApplied
            ? {
                trial_duration_days: String(trialDurationDays),
                trial_feature_policy: trialFeaturePolicy,
                trial_auto_bill_enabled: trialAutoBillEnabled ? 'true' : 'false',
              }
            : {}),
        },
      });
      trialCheckoutSessionCreated = true;

      return respond({
        checkoutUrl: payment.link,
        sessionId: txRef,
        gateway: selectedGateway,
        trialApplied,
        trialAlreadyRedeemed,
        trialDurationDays: trialApplied ? trialDurationDays : 0,
        trialAutoBillEnabled: trialApplied ? trialAutoBillEnabled : true,
        trialFeaturePolicy: trialApplied ? trialFeaturePolicy : null,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    if (selectedGateway === 'paystack') {
      const paystackSecretKey = await getPaystackSecretForRegion();
      const paystackPublicKey = await resolvePaystackPublicKey(gatewaySelection.countryCode);
      const paystackRegionCode = gatewaySelection.countryCode || 'GLOBAL';
      if (!paystackSecretKey) {
        return respond(
          {
            error: 'Paystack is not configured for this region',
            code: 'gateway_not_configured',
            failClosed: true,
          },
          503,
          'failed'
        );
      }

      const manualRenewalMode = !mapping || !autoRenewPreference;
      if (manualRenewalMode && trialApplied) {
        return respond(
          {
            error: 'Trial checkout requires provider-recurring mapping for Paystack.',
            code: 'trial_gateway_unsupported',
            failClosed: true,
          },
          503,
          'failed'
        );
      }

      const reference = `sub_${creatorId}_${Date.now()}`;
      const manualPeriodEndIso = manualRenewalMode ? getManualPeriodEndIso(billingCycle) : null;
      const paystackMetadata = {
        subscription_scope: 'creator_subscription',
        photographer_id: creatorId,
        plan_code: plan.code,
        plan_id: plan.id,
        billing_cycle: billingCycle,
        pricing_currency: checkoutCurrency,
        pricing_amount_cents: Math.round(checkoutAmountInCents),
        auto_renew_preference: manualRenewalMode ? 'false' : autoRenewPreference ? 'true' : 'false',
        renewal_mode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        payment_channel: paymentChannel,
        cancel_at_period_end: manualRenewalMode ? 'true' : !autoRenewPreference ? 'true' : 'false',
        region_code: gatewaySelection.countryCode || null,
        trial_applied: trialApplied ? 'true' : 'false',
        current_period_end: manualPeriodEndIso,
        ...(trialApplied
          ? {
              trial_duration_days: String(trialDurationDays),
              trial_feature_policy: trialFeaturePolicy,
              trial_auto_bill_enabled: trialAutoBillEnabled ? 'true' : 'false',
            }
          : {}),
      };

      const payment = manualRenewalMode
        ? await initializePaystackPayment(
            {
              reference,
              email: user.email || '',
              amount: Math.round(checkoutAmountInCents),
              currency: checkoutCurrency,
              callbackUrl: `${appUrl}/dashboard/billing?success=true&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              metadata: paystackMetadata,
            },
            paystackSecretKey
          )
        : await initializePaystackSubscription(
            {
              reference,
              email: user.email || '',
              amount: Math.round(checkoutAmountInCents),
              currency: checkoutCurrency,
              callbackUrl: `${appUrl}/dashboard/billing?success=true&provider=paystack&reference=${encodeURIComponent(reference)}&region=${encodeURIComponent(paystackRegionCode)}`,
              plan: mapping!.provider_plan_id,
              metadata: paystackMetadata,
            },
            paystackSecretKey
          );
      trialCheckoutSessionCreated = true;

      return respond({
        checkoutUrl: payment.authorizationUrl,
        sessionId: payment.reference,
        gateway: selectedGateway,
        paystack: paystackPublicKey
          ? {
              publicKey: paystackPublicKey,
              email: user.email || '',
              amount: Math.round(checkoutAmountInCents),
              currency: checkoutCurrency,
              reference: payment.reference,
              accessCode: payment.accessCode,
              regionCode: paystackRegionCode,
            }
          : null,
        renewalMode: manualRenewalMode ? 'manual_renewal' : 'provider_recurring',
        currentPeriodEnd: manualPeriodEndIso,
        autoRenewSupported: !manualRenewalMode,
        regionCode: paystackRegionCode,
        trialApplied,
        trialAlreadyRedeemed,
        trialDurationDays: trialApplied ? trialDurationDays : 0,
        trialAutoBillEnabled: trialApplied ? trialAutoBillEnabled : true,
        trialFeaturePolicy: trialApplied ? trialFeaturePolicy : null,
        gatewaySelection: {
          reason: gatewaySelection.reason,
          availableGateways: gatewaySelection.availableGateways,
        },
      }, 200, 'completed');
    }

    return respond(
      {
        error: `Unsupported subscription gateway: ${selectedGateway}`,
        failClosed: true,
      },
      503,
      'failed'
    );

  } catch (error) {
    console.error('Subscription checkout error:', error);
    if (trialClaimDeleteKey && !trialCheckoutSessionCreated) {
      try {
        await createServiceClient()
          .from('subscription_trial_redemptions')
          .delete()
          .eq('checkout_idempotency_key', trialClaimDeleteKey);
      } catch (cleanupError) {
        console.error('Failed to release trial redemption claim after checkout failure:', cleanupError);
      }
    }
    let responseCode = 500;
    let errorPayload: Record<string, unknown> = {
      error:
        error instanceof Error && error.message
          ? error.message
          : 'Failed to create checkout session',
    };
    if (error instanceof PaystackApiError) {
      responseCode = error.statusCode >= 400 && error.statusCode < 500 ? 400 : 502;
      errorPayload = {
        error: error.message || 'Paystack checkout initialization failed',
        code: 'paystack_checkout_failed',
        failClosed: responseCode >= 500,
      };
    } else if (
      isMissingRelationError(error) ||
      isMissingColumnError(error) ||
      isSchemaCacheColumnError(error)
    ) {
      responseCode = 503;
      errorPayload = {
        error:
          'Billing schema is not aligned with this release. Apply latest migrations and retry checkout.',
        code: 'billing_schema_mismatch',
        failClosed: true,
      };
    }
    if (idempotencyFinalizeRef) {
      await idempotencyFinalizeRef('failed', responseCode, errorPayload);
    }
    return NextResponse.json(errorPayload, { status: responseCode, headers: responseHeaders });
  }
}

