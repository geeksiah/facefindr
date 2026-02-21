export const dynamic = 'force-dynamic';

/**
 * Creator Subscription API
 * 
 * Get current subscription status, usage, and payment method.
 * Returns full plan details from the modular pricing system.
 */

import { NextRequest, NextResponse } from 'next/server';

import { stripe } from '@/lib/payments/stripe';
import { getUserPlan, getPlanByCode } from '@/lib/subscription';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET - Get subscription details
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }
    const creatorId = creatorProfile.id as string;
    const lite =
      request.nextUrl.searchParams.get('lite') === '1' ||
      request.nextUrl.searchParams.get('lite') === 'true';

    // Get current plan with full details from modular system
    const currentPlan = await getUserPlan(creatorId, 'photographer');
    const freePlan = await getPlanByCode('free', 'creator');
    
    // Get subscription record
    const nowIso = new Date().toISOString();
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, plan_id, plan_code, status, current_period_end, cancel_at_period_end, payment_provider, external_subscription_id, stripe_subscription_id, updated_at, created_at')
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
    const { data: subscriptionSettings } = await supabase
      .from('subscription_settings')
      .select('auto_renew')
      .eq('user_id', user.id)
      .maybeSingle();

    let eventCount = 0;
    let photoCount = 0;
    let faceOpsCount = 0;
    let wallet: { stripe_account_id?: string | null } | null = null;

    if (!lite) {
      // Get usage stats
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact' })
        .eq('photographer_id', creatorId)
        .in('status', ['draft', 'active']);
      eventCount = count || 0;

      // Get photo count from most recent event
      const { data: recentEvent } = await supabase
        .from('events')
        .select('id')
        .eq('photographer_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (recentEvent) {
        const { count: mediaCount } = await supabase
          .from('media')
          .select('id', { count: 'exact' })
          .eq('event_id', recentEvent.id)
          .is('deleted_at', null);

        photoCount = mediaCount || 0;

        // Get face ops from event
        const { data: eventData } = await supabase
          .from('events')
          .select('face_ops_used')
          .eq('id', recentEvent.id)
          .single();

        faceOpsCount = eventData?.face_ops_used || 0;
      }

      // Get wallet/payment method info
      const { data } = await supabase
        .from('wallets')
        .select('stripe_account_id')
        .eq('photographer_id', creatorId)
        .single();
      wallet = data;
    }

    const paymentMethod = null;
    // Note: To get actual payment method details, you'd need to call Stripe API

    // Build response with structured plan details as the authoritative source.
    const resolvedPlan = currentPlan || freePlan || null;
    const resolvedPlanCode = resolvedPlan?.code || subscription?.plan_code || 'free';
    const resolvedPlanId = resolvedPlan?.id || (subscription?.plan_id as string | null) || null;
    const provider = String(subscription?.payment_provider || '').toLowerCase();
    const externalSubscriptionId = String(
      subscription?.external_subscription_id || subscription?.stripe_subscription_id || ''
    ).trim();
    const providerAutoRenewSupported =
      provider === 'stripe' && Boolean(externalSubscriptionId) && Boolean(stripe);
    const resolvedLimits = resolvedPlan?.limits || {
      maxActiveEvents: 1,
      maxPhotosPerEvent: 50,
      maxFaceOpsPerEvent: 0,
      storageGb: 1,
      teamMembers: 1,
    };

    const resolvedLegacyFeatures = {
      planCode: resolvedPlanCode,
      maxActiveEvents: resolvedLimits.maxActiveEvents,
      maxPhotosPerEvent: resolvedLimits.maxPhotosPerEvent,
      maxFaceOpsPerEvent: resolvedLimits.maxFaceOpsPerEvent,
      storageGb: resolvedLimits.storageGb,
      teamMembers: resolvedLimits.teamMembers,
      platformFeePercent: resolvedPlan?.platformFeePercent ?? 20,
      customWatermark: resolvedPlan?.capabilities.customWatermark ?? false,
      customBranding: resolvedPlan?.capabilities.customBranding ?? false,
      liveEventMode: resolvedPlan?.capabilities.liveEventMode ?? false,
      advancedAnalytics: resolvedPlan?.capabilities.advancedAnalytics ?? false,
      apiAccess: resolvedPlan?.capabilities.apiAccess ?? false,
      prioritySupport: resolvedPlan?.capabilities.prioritySupport ?? false,
      whiteLabel: resolvedPlan?.capabilities.whiteLabel ?? false,
      printProductsEnabled: resolvedPlan?.capabilities.printProducts ?? false,
      printCommissionPercent: resolvedPlan?.printCommissionPercent ?? 15,
      monthlyPrice: resolvedPlan?.prices?.USD ?? resolvedPlan?.basePriceUsd ?? 0,
      annualPrice: Math.round((resolvedPlan?.prices?.USD ?? resolvedPlan?.basePriceUsd ?? 0) * 10),
    };

    return NextResponse.json({
      // New modular plan details
      plan: resolvedPlan ? {
        id: resolvedPlan.id,
        code: resolvedPlan.code,
        name: resolvedPlan.name,
        description: resolvedPlan.description,
        basePriceUsd: resolvedPlan.basePriceUsd,
        platformFeePercent: resolvedPlan.platformFeePercent,
        printCommissionPercent: resolvedPlan.printCommissionPercent,
        limits: resolvedPlan.limits,
        capabilities: resolvedPlan.capabilities,
        displayFeatures: resolvedPlan.features,
      } : null,
      
      // Legacy subscription format for backward compatibility
      subscription: subscription ? {
        planId: resolvedPlanId,
        planCode: resolvedPlanCode,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        paymentProvider: subscription.payment_provider || null,
      } : {
        planId: resolvedPlanId,
        planCode: resolvedPlanCode,
        status: 'active',
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        paymentProvider: null,
      },
      
      // Legacy features format for backward compatibility
      features: resolvedLegacyFeatures,
      
      // Usage stats
      usage: {
        events: eventCount,
        photos: photoCount,
        faceOps: faceOpsCount,
      },
      
      // Limits (from new system if available, else legacy)
      limits: resolvedLimits,
      
      paymentMethod,
      hasStripeAccount: !!wallet?.stripe_account_id,
      autoRenew:
        subscriptionSettings?.auto_renew === undefined || subscriptionSettings?.auto_renew === null
          ? !(subscription?.cancel_at_period_end === true)
          : Boolean(subscriptionSettings.auto_renew),
      canToggleAutoRenew:
        String(resolvedPlanCode || 'free').toLowerCase() !== 'free' &&
        providerAutoRenewSupported,
    });

  } catch (error) {
    console.error('Subscription GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription' },
      { status: 500 }
    );
  }
}

// PATCH - Toggle creator auto-renew
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body?.autoRenew !== 'boolean') {
      return NextResponse.json({ error: 'autoRenew must be boolean' }, { status: 400 });
    }
    const autoRenew = Boolean(body.autoRenew);

    const serviceClient = createServiceClient();
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }
    const creatorId = creatorProfile.id as string;
    const nowIso = new Date().toISOString();

    const { data: subscriptions } = await serviceClient
      .from('subscriptions')
      .select(
        'id, plan_code, status, current_period_end, payment_provider, external_subscription_id, stripe_subscription_id'
      )
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

    if (!subscription || String(subscription.plan_code || 'free').toLowerCase() === 'free') {
      return NextResponse.json(
        { error: 'Auto-renew can only be changed for paid creator subscriptions' },
        { status: 400 }
      );
    }

    const provider = String(subscription.payment_provider || 'stripe').toLowerCase();
    const externalSubscriptionId =
      String(subscription.external_subscription_id || subscription.stripe_subscription_id || '').trim() || null;

    if (provider !== 'stripe' || !externalSubscriptionId) {
      return NextResponse.json(
        {
          error:
            'Auto-renew toggle is only supported for Stripe-managed creator subscriptions.',
        },
        { status: 400 }
      );
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }
    await stripe.subscriptions.update(externalSubscriptionId, {
      cancel_at_period_end: !autoRenew,
    });

    await serviceClient
      .from('subscriptions')
      .update({
        cancel_at_period_end: !autoRenew,
        canceled_at: autoRenew ? null : nowIso,
        updated_at: nowIso,
      })
      .eq('id', subscription.id);

    await serviceClient
      .from('subscription_settings')
      .upsert(
        {
          user_id: user.id,
          auto_renew: autoRenew,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      );

    return NextResponse.json({
      success: true,
      autoRenew,
      cancelAtPeriodEnd: !autoRenew,
      paymentProvider: provider,
      providerSyncApplied: true,
    });
  } catch (error) {
    console.error('Subscription PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update auto-renew setting' },
      { status: 500 }
    );
  }
}

