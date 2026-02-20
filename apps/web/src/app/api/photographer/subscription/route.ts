export const dynamic = 'force-dynamic';

/**
 * Creator Subscription API
 * 
 * Get current subscription status, usage, and payment method.
 * Returns full plan details from the modular pricing system.
 */

import { NextResponse } from 'next/server';

import { getUserPlan, getCreatorPlanFeatures } from '@/lib/subscription';
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
    
    // Also get legacy features for backward compatibility
    const legacyFeatures = await getCreatorPlanFeatures(creatorId);

    // Get subscription record
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('photographer_id', creatorId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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

    // Build response with both new and legacy formats
    return NextResponse.json({
      // New modular plan details
      plan: currentPlan ? {
        id: currentPlan.id,
        code: currentPlan.code,
        name: currentPlan.name,
        description: currentPlan.description,
        basePriceUsd: currentPlan.basePriceUsd,
        platformFeePercent: currentPlan.platformFeePercent,
        printCommissionPercent: currentPlan.printCommissionPercent,
        limits: currentPlan.limits,
        capabilities: currentPlan.capabilities,
        displayFeatures: currentPlan.features,
      } : null,
      
      // Legacy subscription format for backward compatibility
      subscription: subscription ? {
        planCode: subscription.plan_code,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      } : {
        planCode: currentPlan?.code || 'free',
        status: 'active',
        currentPeriodEnd: null,
      },
      
      // Legacy features format for backward compatibility
      features: legacyFeatures,
      
      // Usage stats
      usage: {
        events: eventCount || 0,
        photos: photoCount,
        faceOps: faceOpsCount,
      },
      
      // Limits (from new system if available, else legacy)
      limits: currentPlan?.limits || {
        maxActiveEvents: legacyFeatures.maxActiveEvents,
        maxPhotosPerEvent: legacyFeatures.maxPhotosPerEvent,
        maxFaceOpsPerEvent: legacyFeatures.maxFaceOpsPerEvent,
        storageGb: legacyFeatures.storageGb,
        teamMembers: legacyFeatures.teamMembers,
      },
      
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

