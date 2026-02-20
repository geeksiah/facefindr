export const dynamic = 'force-dynamic';

/**
 * Creator Subscription API
 * 
 * Get current subscription status, usage, and payment method.
 * Returns full plan details from the modular pricing system.
 */

import { NextResponse } from 'next/server';

import { getUserPlan, getPlanByCode } from '@/lib/subscription';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET - Get subscription details
export async function GET() {
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

    // Get current plan with full details from modular system
    const currentPlan = await getUserPlan(creatorId, 'photographer');
    const freePlan = await getPlanByCode('free', 'creator');
    
    // Get subscription record
    const nowIso = new Date().toISOString();
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('plan_id, plan_code, status, current_period_end, updated_at, created_at')
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

    // Get usage stats
    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact' })
      .eq('photographer_id', creatorId)
      .in('status', ['draft', 'active']);

    // Get photo count from most recent event
    const { data: recentEvent } = await supabase
      .from('events')
      .select('id')
      .eq('photographer_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let photoCount = 0;
    let faceOpsCount = 0;
    
    if (recentEvent) {
      const { count } = await supabase
        .from('media')
        .select('id', { count: 'exact' })
        .eq('event_id', recentEvent.id)
        .is('deleted_at', null);
      
      photoCount = count || 0;

      // Get face ops from event
      const { data: eventData } = await supabase
        .from('events')
        .select('face_ops_used')
        .eq('id', recentEvent.id)
        .single();
      
      faceOpsCount = eventData?.face_ops_used || 0;
    }

    // Get wallet/payment method info
    const { data: wallet } = await supabase
      .from('wallets')
      .select('stripe_account_id')
      .eq('photographer_id', creatorId)
      .single();

    const paymentMethod = null;
    // Note: To get actual payment method details, you'd need to call Stripe API

    // Build response with structured plan details as the authoritative source.
    const resolvedPlan = currentPlan || freePlan || null;
    const resolvedPlanCode = resolvedPlan?.code || subscription?.plan_code || 'free';
    const resolvedPlanId = resolvedPlan?.id || (subscription?.plan_id as string | null) || null;
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
      } : {
        planId: resolvedPlanId,
        planCode: resolvedPlanCode,
        status: 'active',
        currentPeriodEnd: null,
      },
      
      // Legacy features format for backward compatibility
      features: resolvedLegacyFeatures,
      
      // Usage stats
      usage: {
        events: eventCount || 0,
        photos: photoCount,
        faceOps: faceOpsCount,
      },
      
      // Limits (from new system if available, else legacy)
      limits: resolvedLimits,
      
      paymentMethod,
      hasStripeAccount: !!wallet?.stripe_account_id,
    });

  } catch (error) {
    console.error('Subscription GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription' },
      { status: 500 }
    );
  }
}

