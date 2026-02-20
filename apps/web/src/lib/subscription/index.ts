/**
 * Subscription & Plans Service
 * 
 * Unified service for fetching plans and features from the database.
 * Supports creator, drop-in, and PAYG plans.
 * Falls back to defaults if database is unavailable.
 */

import { createServiceClient } from '@/lib/supabase/server';

// Re-export everything from plans.ts for backward compatibility
export * from './plans';

// Re-export enforcement utilities
export * from './enforcement';

// ============================================
// TYPES
// ============================================

export type PlanType = 'creator' | 'photographer' | 'drop_in' | 'payg';

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  planType: PlanType;
  basePriceUsd: number; // in cents
  prices: Record<string, number>; // currency code -> price in cents
  isActive: boolean;
  isPopular: boolean;
  features: string[]; // Display features (text list)
  platformFeePercent: number;
  platformFeeFixed: number;
  platformFeeType: 'percent' | 'fixed' | 'both';
  printCommissionPercent: number;
  printCommissionFixed: number;
  printCommissionType: 'percent' | 'fixed' | 'both';
  createdAt: string;
}

export interface PlanFeatureValue {
  featureCode: string;
  featureName: string;
  featureType: 'limit' | 'boolean' | 'numeric' | 'text';
  value: number | boolean | string;
  category: string;
}

export interface FullPlanDetails extends SubscriptionPlan {
  featureValues: PlanFeatureValue[];
  // Computed convenience properties
  limits: {
    maxActiveEvents: number;
    maxPhotosPerEvent: number;
    maxFaceOpsPerEvent: number;
    storageGb: number;
    teamMembers: number;
    retentionDays: number;
  };
  capabilities: {
    faceRecognition: boolean;
    customWatermark: boolean;
    customBranding: boolean;
    liveEventMode: boolean;
    advancedAnalytics: boolean;
    apiAccess: boolean;
    prioritySupport: boolean;
    whiteLabel: boolean;
    printProducts: boolean;
    // Drop-in specific
    externalSearch: boolean;
    contactSearch: boolean;
    giftEnabled: boolean;
    unlimitedUploads: boolean;
  };
}

interface SubscriptionLookupRow {
  plan_id?: string | null;
  plan_code?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

// ============================================
// CACHE
// ============================================

const plansCache: Map<string, FullPlanDetails> = new Map();
let plansCacheTime = 0;
const PLANS_CACHE_TTL = 60 * 1000; // 1 minute

// ============================================
// FETCH ALL PLANS
// ============================================

function isCreatorVisiblePlan(plan: FullPlanDetails): boolean {
  return plan.planType === 'creator' || plan.planType === 'payg';
}

function normalizeRequestedPlanType(planType?: PlanType): 'creator' | 'drop_in' | 'payg' | null {
  if (!planType) return null;
  if (planType === 'creator' || planType === 'photographer') return 'creator';
  if (planType === 'drop_in') return 'drop_in';
  if (planType === 'payg') return 'payg';
  return null;
}

function filterPlansByType(plans: FullPlanDetails[], requestedType?: PlanType): FullPlanDetails[] {
  const normalized = normalizeRequestedPlanType(requestedType);
  if (!normalized) return plans;
  if (normalized === 'creator') return plans.filter(isCreatorVisiblePlan);
  if (normalized === 'payg') return plans.filter((plan) => plan.planType === 'payg');
  return plans.filter((plan) => plan.planType === normalized);
}

export async function getAllPlans(planType?: PlanType): Promise<FullPlanDetails[]> {
  const now = Date.now();
  
  // Check cache
  if (plansCacheTime && (now - plansCacheTime) < PLANS_CACHE_TTL && plansCache.size > 0) {
    const cached = Array.from(plansCache.values());
    return filterPlansByType(cached, planType);
  }

  try {
    const supabase = createServiceClient();
    
    // Fetch plans
    let query = supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('base_price_usd', { ascending: true });
    
    // Apply DB-level filters only for stable enum values.
    // For creator plans, fetch active rows and filter in app code so this works
    // across environments that store either "creator" or "photographer".
    const normalizedType = normalizeRequestedPlanType(planType);
    if (normalizedType === 'payg') {
      query = query.eq('plan_type', 'payg');
    } else if (normalizedType === 'drop_in') {
      query = query.eq('plan_type', 'drop_in');
    }
    
    const { data: plans, error: plansError } = await query;
    
    if (plansError) {
      console.error('Error fetching plans:', plansError);
      return [];
    }

    if (!plans || plans.length === 0) {
      return [];
    }

    // Fetch feature assignments for all plans
    const planIds = plans.map(p => p.id);
    const { data: assignments } = await supabase
      .from('plan_feature_assignments')
      .select(`
        plan_id,
        feature_value,
        plan_features (
          code,
          name,
          feature_type,
          category
        )
      `)
      .in('plan_id', planIds);

    // Build feature map by plan
    const featuresByPlan = new Map<string, PlanFeatureValue[]>();
    assignments?.forEach(a => {
      const feature = a.plan_features as any;
      if (!feature) return;
      
      const planFeatures = featuresByPlan.get(a.plan_id) || [];
      planFeatures.push({
        featureCode: feature.code,
        featureName: feature.name,
        featureType: feature.feature_type,
        value: parseFeatureValue(a.feature_value, feature.feature_type),
        category: feature.category || 'general',
      });
      featuresByPlan.set(a.plan_id, planFeatures);
    });

    // Build full plan details
    const fullPlans: FullPlanDetails[] = plans.map(plan => {
      const featureValues = featuresByPlan.get(plan.id) || [];
      
      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description || '',
        planType:
          (plan.plan_type === 'photographer'
            ? 'creator'
            : (plan.plan_type as 'creator' | 'drop_in' | 'payg')) || 'creator',
        basePriceUsd: plan.base_price_usd || 0,
        prices: plan.prices || {},
        isActive: plan.is_active,
        isPopular: plan.is_popular || false,
        features: plan.features || [],
        platformFeePercent: Number(plan.platform_fee_percent) || 20,
        platformFeeFixed: plan.platform_fee_fixed || 0,
        platformFeeType: plan.platform_fee_type || 'percent',
        printCommissionPercent: Number(plan.print_commission_percent) || 15,
        printCommissionFixed: plan.print_commission_fixed || 0,
        printCommissionType: plan.print_commission_type || 'percent',
        createdAt: plan.created_at,
        featureValues,
        limits: extractLimits(featureValues, plan),
        capabilities: extractCapabilities(featureValues, plan),
      };
    });

    // Update cache
    plansCache.clear();
    fullPlans.forEach(p => plansCache.set(p.id, p));
    plansCacheTime = now;

    return filterPlansByType(fullPlans, planType);
  } catch (error) {
    console.error('Error in getAllPlans:', error);
    return [];
  }
}

// ============================================
// GET SINGLE PLAN
// ============================================

export async function getPlanById(planId: string): Promise<FullPlanDetails | null> {
  // Check cache first
  if (plansCache.has(planId)) {
    return plansCache.get(planId) || null;
  }

  // Fetch all plans to populate cache
  const plans = await getAllPlans();
  return plans.find(p => p.id === planId) || null;
}

export async function getPlanByCode(code: string, planType: PlanType = 'creator'): Promise<FullPlanDetails | null> {
  const plans = await getAllPlans(planType);
  const normalizedCode = String(code || '').toLowerCase();
  return plans.find(p => p.code.toLowerCase() === normalizedCode) || null;
}

// ============================================
// GET USER'S CURRENT PLAN
// ============================================

function subscriptionPriority(row: SubscriptionLookupRow): number {
  let score = 0;
  const status = String(row.status || '').toLowerCase();
  const planCode = String(row.plan_code || '').toLowerCase();

  if (status === 'active') score += 100;
  if (status === 'trialing') score += 80;
  if (planCode && planCode !== 'free') score += 20;
  if (row.current_period_end) score += 5;

  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
  score += Math.floor((updatedAt || createdAt) / 1000000000);

  return score;
}

function pickBestSubscription(rows: SubscriptionLookupRow[]): SubscriptionLookupRow | null {
  if (!rows.length) return null;
  return rows.reduce((best: SubscriptionLookupRow | null, row) => {
    if (!best) return row;
    return subscriptionPriority(row) > subscriptionPriority(best) ? row : best;
  }, null);
}

async function resolveFreePlan(planType: 'creator' | 'drop_in') {
  const explicitFree = await getPlanByCode('free', planType);
  if (explicitFree) return explicitFree;

  const all = await getAllPlans(planType);
  if (!all.length) return null;
  return [...all].sort((a, b) => (a.basePriceUsd || 0) - (b.basePriceUsd || 0))[0] || null;
}

export async function getUserPlan(userId: string, userType: 'creator' | 'photographer' | 'attendee'): Promise<FullPlanDetails | null> {
  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

    const isCreator = userType === 'creator' || userType === 'photographer';
    const subscriptionTable = isCreator ? 'subscriptions' : 'attendee_subscriptions';
    const ownerColumn = isCreator ? 'photographer_id' : 'attendee_id';

    const { data: subscriptionRows } = await supabase
      .from(subscriptionTable)
      .select(isCreator ? 'plan_id, plan_code, status, current_period_end, updated_at, created_at' : 'plan_code, status, current_period_end, updated_at, created_at')
      .eq(ownerColumn, userId)
      .in('status', ['active', 'trialing'])
      .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    const subscription = pickBestSubscription((subscriptionRows || []) as SubscriptionLookupRow[]);
    const planType = isCreator ? 'creator' : 'drop_in';

    if (!subscription) {
      return resolveFreePlan(planType);
    }

    if (isCreator && subscription.plan_id) {
      const byId = await getPlanById(subscription.plan_id);
      if (byId) return byId;
    }

    if (subscription.plan_code) {
      const byCode = await getPlanByCode(subscription.plan_code, planType);
      if (byCode) return byCode;
    }

    return resolveFreePlan(planType);
  } catch (error) {
    console.error('Error getting user plan:', error);
    const planType = userType === 'creator' || userType === 'photographer' ? 'creator' : 'drop_in';
    return resolveFreePlan(planType);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseFeatureValue(value: any, featureType: string): number | boolean | string {
  if (value === null || value === undefined) {
    return featureType === 'boolean' ? false : featureType === 'numeric' || featureType === 'limit' ? 0 : '';
  }
  
  // Handle nested JSONB payloads such as { "value": 10 }
  if (typeof value === 'object') {
    if (value && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
      return parseFeatureValue((value as any).value, featureType);
    }
    return featureType === 'boolean' ? false : featureType === 'numeric' || featureType === 'limit' ? 0 : '';
  }
  
  switch (featureType) {
    case 'boolean':
      return value === true || value === 'true';
    case 'numeric':
    case 'limit':
      return Number(value) || 0;
    case 'text':
      return String(value);
    default:
      return value;
  }
}

function extractLimits(featureValues: PlanFeatureValue[], plan: any): FullPlanDetails['limits'] {
  const getValue = (code: string, defaultValue: number) => {
    const feature = featureValues.find(f => f.featureCode === code);
    return feature ? Number(feature.value) || defaultValue : defaultValue;
  };

  return {
    maxActiveEvents: getValue('max_active_events', 1),
    maxPhotosPerEvent: getValue('max_photos_per_event', 50),
    maxFaceOpsPerEvent: getValue('max_face_ops_per_event', 0),
    storageGb: getValue('storage_gb', 1),
    teamMembers: getValue('team_members', 1),
    retentionDays: getValue('retention_days', 30),
  };
}

function extractCapabilities(featureValues: PlanFeatureValue[], plan: any): FullPlanDetails['capabilities'] {
  const getBool = (code: string, defaultValue: boolean) => {
    const feature = featureValues.find(f => f.featureCode === code);
    return feature ? feature.value === true : defaultValue;
  };

  return {
    faceRecognition: getBool('face_recognition_enabled', false),
    customWatermark: getBool('custom_watermark', false),
    customBranding: getBool('custom_branding', false),
    liveEventMode: getBool('live_event_mode', false),
    advancedAnalytics: getBool('advanced_analytics', false),
    apiAccess: getBool('api_access', false),
    prioritySupport: getBool('priority_support', false),
    whiteLabel: getBool('white_label', false),
    printProducts: getBool('print_products_enabled', true),
    // Drop-in specific
    externalSearch: getBool('drop_in_external_search', false),
    contactSearch: getBool('drop_in_contact_search', true),
    giftEnabled: getBool('drop_in_gift_enabled', false),
    unlimitedUploads: getBool('drop_in_unlimited_uploads', false),
  };
}

// ============================================
// CLEAR CACHE (for admin updates)
// ============================================

export function clearPlansCache(): void {
  plansCache.clear();
  plansCacheTime = 0;
}
