/**
 * Photographer Subscription API
 * 
 * Get current subscription status, usage, and payment method.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPhotographerPlan, getPhotographerPlanFeatures } from '@/lib/subscription';

// GET - Get subscription details
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current plan
    const planCode = await getPhotographerPlan(user.id);
    const features = await getPhotographerPlanFeatures(user.id);

    // Get subscription record
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('photographer_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get usage stats
    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact' })
      .eq('photographer_id', user.id)
      .in('status', ['draft', 'active']);

    // Get photo count from most recent event
    const { data: recentEvent } = await supabase
      .from('events')
      .select('id')
      .eq('photographer_id', user.id)
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
      .eq('photographer_id', user.id)
      .single();

    let paymentMethod = null;
    // Note: To get actual payment method details, you'd need to call Stripe API
    // This is a placeholder - in production, fetch from Stripe

    return NextResponse.json({
      subscription: subscription ? {
        planCode: subscription.plan_code,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      } : {
        planCode: 'free',
        status: 'active',
        currentPeriodEnd: null,
      },
      features,
      usage: {
        events: eventCount || 0,
        photos: photoCount,
        faceOps: faceOpsCount,
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
