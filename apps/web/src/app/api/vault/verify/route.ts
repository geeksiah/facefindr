export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import {
  resolvePaystackSecretKey,
  verifyPaystackTransaction,
} from '@/lib/payments/paystack';
import {
  parseMetadataRecord,
  readNumber,
  readString,
  syncRecurringSubscriptionRecord,
} from '@/lib/payments/recurring-sync';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function isSuccessfulPaystackStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  return (
    normalized === 'success' ||
    normalized === 'successful' ||
    normalized === 'completed'
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

    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').trim().toLowerCase();
    const reference = String(body?.reference || '').trim();

    if (provider !== 'paystack') {
      return NextResponse.json(
        { error: 'Only Paystack verification is supported for vault subscriptions.' },
        { status: 400 }
      );
    }

    if (!reference) {
      return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 });
    }

    const { data: pendingSubscription } = await serviceClient
      .from('storage_subscriptions')
      .select('id, plan_id, metadata')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const pendingMetadata = parseMetadataRecord(pendingSubscription?.metadata);

    const regionCode = readString(pendingMetadata.region_code) || undefined;
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
    const scope = readString(metadata.subscription_scope) || 'vault_subscription';
    if (scope !== 'vault_subscription') {
      return NextResponse.json({ error: 'Reference is not a vault subscription payment.' }, { status: 400 });
    }

    const metadataUserId = readString(metadata.user_id);
    if (metadataUserId && metadataUserId !== user.id) {
      return NextResponse.json({ error: 'Payment does not belong to this account.' }, { status: 403 });
    }

    const amountCents =
      readNumber(metadata.pricing_amount_cents) ??
      (Number.isFinite(Number(verified.amount)) ? Math.round(Number(verified.amount)) : null);

    await syncRecurringSubscriptionRecord({
      supabase: serviceClient,
      provider: 'paystack',
      scope: 'vault_subscription',
      status: 'active',
      eventType: 'manual_verify',
      externalSubscriptionId: reference,
      externalPlanId: readString(metadata.provider_plan_id),
      billingCycle: readString(metadata.billing_cycle) || 'monthly',
      currency: readString(verified.currency) || readString(metadata.pricing_currency) || 'USD',
      amountCents,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: readString(metadata.current_period_end),
      cancelAtPeriodEnd: readString(metadata.cancel_at_period_end) === 'true',
      userId: user.id,
      planId: readString(metadata.plan_id) || String(pendingSubscription?.plan_id || ''),
      planSlug: readString(metadata.plan_slug) || readString(pendingMetadata.plan_slug),
      metadata: {
        ...pendingMetadata,
        ...metadata,
        paystack_reference: reference,
        verification_source: 'vault.verify.api',
      },
    });

    const { data: subscription } = await serviceClient
      .from('storage_subscriptions')
      .select('status, plan_id, billing_cycle, current_period_end, payment_provider')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    return NextResponse.json({
      success: true,
      subscription: subscription || null,
      reference,
    });
  } catch (error: any) {
    console.error('Vault payment verification error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to verify vault payment.' },
      { status: 500 }
    );
  }
}

