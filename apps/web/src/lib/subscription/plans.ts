/**
 * Subscription Plans & Features
 * 
 * Revenue Strategy:
 * - Free tier: Generous limits, but 20% platform fee captures value from sales
 * - Starter/Pro/Studio: Lower fees incentivize upgrade, plus subscription revenue
 * - Print products: Additional revenue stream with photographer commission
 */

import { createServiceClient } from '@/lib/supabase/server';

export type PlanCode = 'free' | 'starter' | 'pro' | 'studio';

export interface PlanFeatures {
  planCode: PlanCode;
  
  // Limits
  maxActiveEvents: number; // -1 = unlimited
  maxPhotosPerEvent: number;
  maxFaceOpsPerEvent: number;
  storageGb: number;
  
  // Fees
  platformFeePercent: number;
  
  // Features
  customWatermark: boolean;
  customBranding: boolean;
  liveEventMode: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  teamMembers: number;
  whiteLabel: boolean;
  
  // Prints
  printProductsEnabled: boolean;
  printCommissionPercent: number;
  
  // Pricing
  monthlyPrice: number; // in cents
  annualPrice: number; // in cents
}

// Default features (used if DB unavailable)
export const DEFAULT_PLAN_FEATURES: Record<PlanCode, PlanFeatures> = {
  free: {
    planCode: 'free',
    maxActiveEvents: 3,
    maxPhotosPerEvent: 100,
    maxFaceOpsPerEvent: 500,
    storageGb: 5,
    platformFeePercent: 20,
    customWatermark: false,
    customBranding: false,
    liveEventMode: false,
    advancedAnalytics: false,
    apiAccess: false,
    prioritySupport: false,
    teamMembers: 1,
    whiteLabel: false,
    printProductsEnabled: true,
    printCommissionPercent: 15,
    monthlyPrice: 0,
    annualPrice: 0,
  },
  starter: {
    planCode: 'starter',
    maxActiveEvents: 10,
    maxPhotosPerEvent: 500,
    maxFaceOpsPerEvent: 2000,
    storageGb: 25,
    platformFeePercent: 15,
    customWatermark: true,
    customBranding: false,
    liveEventMode: false,
    advancedAnalytics: true,
    apiAccess: false,
    prioritySupport: true,
    teamMembers: 1,
    whiteLabel: false,
    printProductsEnabled: true,
    printCommissionPercent: 20,
    monthlyPrice: 999,
    annualPrice: 9588,
  },
  pro: {
    planCode: 'pro',
    maxActiveEvents: -1, // Unlimited
    maxPhotosPerEvent: 2000,
    maxFaceOpsPerEvent: 10000,
    storageGb: 100,
    platformFeePercent: 10,
    customWatermark: true,
    customBranding: true,
    liveEventMode: true,
    advancedAnalytics: true,
    apiAccess: true,
    prioritySupport: true,
    teamMembers: 3,
    whiteLabel: false,
    printProductsEnabled: true,
    printCommissionPercent: 25,
    monthlyPrice: 2999,
    annualPrice: 28788,
  },
  studio: {
    planCode: 'studio',
    maxActiveEvents: -1, // Unlimited
    maxPhotosPerEvent: 5000,
    maxFaceOpsPerEvent: 50000,
    storageGb: 500,
    platformFeePercent: 8,
    customWatermark: true,
    customBranding: true,
    liveEventMode: true,
    advancedAnalytics: true,
    apiAccess: true,
    prioritySupport: true,
    teamMembers: 10,
    whiteLabel: true,
    printProductsEnabled: true,
    printCommissionPercent: 30,
    monthlyPrice: 7999,
    annualPrice: 76788,
  },
};

// Human-readable plan names
export const PLAN_NAMES: Record<PlanCode, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  studio: 'Studio',
};

// Plan descriptions
export const PLAN_DESCRIPTIONS: Record<PlanCode, string> = {
  free: 'Perfect for getting started',
  starter: 'For growing photographers',
  pro: 'For professionals',
  studio: 'For photography businesses',
};

// ============================================
// GET PLAN FEATURES
// ============================================

let cachedFeatures: Record<PlanCode, PlanFeatures> | null = null;
let featuresCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getAllPlanFeatures(): Promise<Record<PlanCode, PlanFeatures>> {
  const now = Date.now();
  
  if (cachedFeatures && (now - featuresCacheTime) < CACHE_TTL) {
    return cachedFeatures;
  }

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('subscription_plan_features')
      .select('*');

    if (data && data.length > 0) {
      cachedFeatures = {} as Record<PlanCode, PlanFeatures>;
      
      for (const row of data) {
        cachedFeatures[row.plan_code as PlanCode] = {
          planCode: row.plan_code,
          maxActiveEvents: row.max_active_events,
          maxPhotosPerEvent: row.max_photos_per_event,
          maxFaceOpsPerEvent: row.max_face_ops_per_event,
          storageGb: row.storage_gb,
          platformFeePercent: Number(row.platform_fee_percent),
          customWatermark: row.custom_watermark,
          customBranding: row.custom_branding,
          liveEventMode: row.live_event_mode,
          advancedAnalytics: row.advanced_analytics,
          apiAccess: row.api_access,
          prioritySupport: row.priority_processing ?? row.priority_support,
          teamMembers: row.team_members,
          whiteLabel: row.white_label,
          printProductsEnabled: row.print_products_enabled,
          printCommissionPercent: Number(row.print_commission_percent),
          monthlyPrice: row.monthly_price,
          annualPrice: row.annual_price,
        };
      }
      
      featuresCacheTime = now;
      return cachedFeatures;
    }
  } catch (error) {
    console.error('Failed to fetch plan features:', error);
  }

  return DEFAULT_PLAN_FEATURES;
}

export async function getPlanFeatures(planCode: PlanCode): Promise<PlanFeatures> {
  const allFeatures = await getAllPlanFeatures();
  return allFeatures[planCode] || DEFAULT_PLAN_FEATURES.free;
}

// ============================================
// GET PHOTOGRAPHER'S CURRENT PLAN
// ============================================

export async function getCreatorPlan(photographerId: string): Promise<PlanCode> {
  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('subscriptions')
      .select('plan_code, status, current_period_end, updated_at, created_at')
      .eq('photographer_id', photographerId)
      .in('status', ['active', 'trialing'])
      .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const paid = data.find((row: any) => String(row.plan_code || '').toLowerCase() !== 'free');
      const selected = paid || data[0];
      const planCode = String((selected as any)?.plan_code || 'free').toLowerCase() as PlanCode;
      if (planCode in DEFAULT_PLAN_FEATURES) {
        return planCode;
      }
    }
  } catch (error) {
    console.error('Failed to resolve creator plan:', error);
  }

  return 'free';
}

export async function getCreatorPlanFeatures(photographerId: string): Promise<PlanFeatures> {
  const planCode = await getCreatorPlan(photographerId);
  return getPlanFeatures(planCode);
}

// ============================================
// LIMIT CHECKS
// ============================================

export async function checkEventLimit(photographerId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  unlimited: boolean;
}> {
  const supabase = createServiceClient();
  const features = await getCreatorPlanFeatures(photographerId);

  // Count active events
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact' })
    .eq('photographer_id', photographerId)
    .in('status', ['draft', 'active']);

  const current = count || 0;
  const limit = features.maxActiveEvents;
  const unlimited = limit === -1;

  return {
    allowed: unlimited || current < limit,
    current,
    limit,
    unlimited,
  };
}

export async function checkPhotoLimit(eventId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const supabase = createServiceClient();

  // Get event and photographer
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!event) {
    return { allowed: false, current: 0, limit: 0 };
  }

  const features = await getCreatorPlanFeatures(event.photographer_id);

  // Count photos in event
  const { count } = await supabase
    .from('media')
    .select('id', { count: 'exact' })
    .eq('event_id', eventId)
    .is('deleted_at', null);

  const current = count || 0;
  const limit = features.maxPhotosPerEvent;

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

export async function checkFaceOpsLimit(eventId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const supabase = createServiceClient();

  // Get event
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id, face_ops_used')
    .eq('id', eventId)
    .single();

  if (!event) {
    return { allowed: false, used: 0, limit: 0 };
  }

  const features = await getCreatorPlanFeatures(event.photographer_id);
  const used = event.face_ops_used || 0;
  const limit = features.maxFaceOpsPerEvent;

  return {
    allowed: used < limit,
    used,
    limit,
  };
}

// ============================================
// FEATURE CHECKS
// ============================================

export async function hasFeature(
  photographerId: string,
  feature: keyof PlanFeatures
): Promise<boolean> {
  const features = await getCreatorPlanFeatures(photographerId);
  const value = features[feature];
  
  // Handle different types
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0 || value === -1;
  return !!value;
}

export async function getCreatorPlatformFee(photographerId: string): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_photographer_limits', {
      p_photographer_id: photographerId,
    });
    const percent = Number(data?.[0]?.platform_fee_percent);
    if (!error && Number.isFinite(percent)) {
      return percent / 100;
    }
  } catch (error) {
    console.error('Failed to resolve platform fee from plan limits RPC:', error);
  }

  try {
    const supabase = createServiceClient();
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_id, plan_code')
      .eq('photographer_id', photographerId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription) {
      let planQuery = supabase
        .from('subscription_plans')
        .select('platform_fee_percent');

      if (subscription.plan_id) {
        planQuery = planQuery.eq('id', subscription.plan_id);
      } else if (subscription.plan_code) {
        planQuery = planQuery.eq('code', subscription.plan_code);
      }

      const { data: planRow } = await planQuery.maybeSingle();
      const feePercent = Number((planRow as any)?.platform_fee_percent);
      if (Number.isFinite(feePercent)) {
        return feePercent / 100;
      }
    }
  } catch (error) {
    console.error('Failed to resolve platform fee from subscription plan:', error);
  }

  const features = await getCreatorPlanFeatures(photographerId);
  return features.platformFeePercent / 100; // Convert to decimal
}

export async function getCreatorPrintCommission(photographerId: string): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_id, plan_code')
      .eq('photographer_id', photographerId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscription) {
      let planQuery = supabase
        .from('subscription_plans')
        .select('print_commission_percent');

      if (subscription.plan_id) {
        planQuery = planQuery.eq('id', subscription.plan_id);
      } else if (subscription.plan_code) {
        planQuery = planQuery.eq('code', subscription.plan_code);
      }

      const { data: planRow } = await planQuery.maybeSingle();
      const commissionPercent = Number((planRow as any)?.print_commission_percent);
      if (Number.isFinite(commissionPercent)) {
        return commissionPercent / 100;
      }
    }
  } catch (error) {
    console.error('Failed to resolve print commission from subscription plan:', error);
  }

  const features = await getCreatorPlanFeatures(photographerId);
  return features.printCommissionPercent / 100; // Convert to decimal
}

// ============================================
// COMPARISON FOR UPGRADE PROMPTS
// ============================================

export interface PlanComparison {
  currentPlan: PlanCode;
  suggestedPlan: PlanCode;
  reason: string;
  savings?: number; // Annual savings in cents
}

export async function suggestUpgrade(photographerId: string): Promise<PlanComparison | null> {
  const currentPlan = await getCreatorPlan(photographerId);
  const features = await getPlanFeatures(currentPlan);
  const supabase = createServiceClient();

  // Check if hitting limits
  const { count: eventCount } = await supabase
    .from('events')
    .select('id', { count: 'exact' })
    .eq('photographer_id', photographerId)
    .in('status', ['draft', 'active']);

  // Suggest upgrade if at 80% of event limit
  if (features.maxActiveEvents !== -1 && (eventCount || 0) >= features.maxActiveEvents * 0.8) {
    const nextPlan = getNextPlan(currentPlan);
    if (nextPlan) {
      const nextFeatures = await getPlanFeatures(nextPlan);
      return {
        currentPlan,
        suggestedPlan: nextPlan,
        reason: `You're approaching your event limit. Upgrade to ${PLAN_NAMES[nextPlan]} for ${nextFeatures.maxActiveEvents === -1 ? 'unlimited' : nextFeatures.maxActiveEvents} events.`,
      };
    }
  }

  // Suggest upgrade if platform fees are high
  // Calculate potential savings from lower fee
  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('gross_amount')
    .eq('wallet_id', photographerId)
    .eq('status', 'succeeded')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (recentTransactions && recentTransactions.length > 0) {
    const monthlyRevenue = recentTransactions.reduce((sum, t) => sum + t.gross_amount, 0);
    const annualRevenue = monthlyRevenue * 12;

    const nextPlan = getNextPlan(currentPlan);
    if (nextPlan) {
      const nextFeatures = await getPlanFeatures(nextPlan);
      const currentFees = annualRevenue * (features.platformFeePercent / 100);
      const nextFees = annualRevenue * (nextFeatures.platformFeePercent / 100);
      const feeSavings = currentFees - nextFees;
      const planCost = nextFeatures.annualPrice;

      // Suggest if fee savings exceed plan cost
      if (feeSavings > planCost * 1.5) {
        return {
          currentPlan,
          suggestedPlan: nextPlan,
          reason: `Based on your sales, upgrading to ${PLAN_NAMES[nextPlan]} could save you ${formatCurrency(feeSavings - planCost)} per year in fees.`,
          savings: feeSavings - planCost,
        };
      }
    }
  }

  return null;
}

function getNextPlan(current: PlanCode): PlanCode | null {
  const order: PlanCode[] = ['free', 'starter', 'pro', 'studio'];
  const currentIndex = order.indexOf(current);
  return currentIndex < order.length - 1 ? order[currentIndex + 1] : null;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
