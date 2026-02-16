/**
 * Plan Features Helper
 * 
 * Functions to get plan limits and features from the database
 * instead of hardcoded PLAN_LIMITS constant.
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface PlanLimits {
  photos_per_event: number;
  active_events: number;
  face_ops_per_event: number;
  retention_days: number;
  face_recognition_enabled: boolean;
  priority_processing: boolean;
  api_access: boolean;
}

/**
 * Get plan limits for a photographer from database
 */
export async function getPlanLimits(
  photographerId: string,
  planType: 'creator' | 'photographer' | 'drop_in' = 'creator'
): Promise<PlanLimits> {
  try {
    const supabase = createServiceClient();
    
    // Get photographer's subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_code')
      .eq('photographer_id', photographerId)
      .eq('status', 'active')
      .single();

    if (!subscription) {
      // Return free plan defaults
      return {
        photos_per_event: 100,
        active_events: 1,
        face_ops_per_event: 0,
        retention_days: 30,
        face_recognition_enabled: false,
        priority_processing: false,
        api_access: false,
      };
    }

    // Get plan by plan_code
    let planQuery = supabase
      .from('subscription_plans')
      .select('id')
      .eq('code', subscription.plan_code);

    if (planType === 'creator' || planType === 'photographer') {
      planQuery = planQuery.in('plan_type', ['creator', 'photographer']);
    } else {
      planQuery = planQuery.eq('plan_type', planType);
    }

    const { data: plan } = await planQuery.single();

    if (!plan) {
      // Return free plan defaults
      return {
        photos_per_event: 100,
        active_events: 1,
        face_ops_per_event: 0,
        retention_days: 30,
        face_recognition_enabled: false,
        priority_processing: false,
        api_access: false,
      };
    }

    const planId = plan.id;

    // Get plan features using RPC function
    const { data: features, error } = await supabase.rpc('get_plan_features', {
      p_plan_id: planId,
    });

    if (error) {
      console.error('Error getting plan features:', error);
      // Return free plan defaults on error
      return {
        photos_per_event: 100,
        active_events: 1,
        face_ops_per_event: 0,
        retention_days: 30,
        face_recognition_enabled: false,
        priority_processing: false,
        api_access: false,
      };
    }

    // Convert features array to PlanLimits object
    const limits: PlanLimits = {
      photos_per_event: 100,
      active_events: 1,
      face_ops_per_event: 0,
      retention_days: 30,
      face_recognition_enabled: false,
      priority_processing: false,
      api_access: false,
    };

    (features || []).forEach((feature: any) => {
      const code = feature.feature_code;
      const value = feature.feature_value;

      switch (code) {
        case 'max_photos_per_event':
          limits.photos_per_event = typeof value === 'number' ? value : parseInt(value) || 100;
          break;
        case 'max_active_events':
          limits.active_events = typeof value === 'number' ? value : parseInt(value) || 1;
          break;
        case 'max_face_ops_per_event':
          limits.face_ops_per_event = typeof value === 'number' ? value : parseInt(value) || 0;
          break;
        case 'retention_days':
          limits.retention_days = typeof value === 'number' ? value : parseInt(value) || 30;
          break;
        case 'face_recognition_enabled':
          limits.face_recognition_enabled = value === true || value === 'true';
          break;
        case 'priority_processing':
          limits.priority_processing = value === true || value === 'true';
          break;
        case 'api_access':
          limits.api_access = value === true || value === 'true';
          break;
      }
    });

    return limits;
  } catch (error) {
    console.error('Error in getPlanLimits:', error);
    // Return free plan defaults on error
    return {
      photos_per_event: 100,
      active_events: 1,
      face_ops_per_event: 0,
      retention_days: 30,
      face_recognition_enabled: false,
      priority_processing: false,
      api_access: false,
    };
  }
}

/**
 * Get feature value for a specific feature code
 */
export async function getFeatureValue(
  photographerId: string,
  featureCode: string
): Promise<any> {
  try {
    const supabase = createServiceClient();
    
    // Get photographer's subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('subscription_plans(id)')
      .eq('photographer_id', photographerId)
      .eq('status', 'active')
      .single();

    if (!subscription || !subscription.subscription_plans) {
      return null;
    }

    const planId = (subscription.subscription_plans as any).id;

    // Get plan features
    const { data: features } = await supabase.rpc('get_plan_features', {
      p_plan_id: planId,
    });

    const feature = (features || []).find((f: any) => f.feature_code === featureCode);
    return feature?.feature_value || null;
  } catch (error) {
    console.error('Error in getFeatureValue:', error);
    return null;
  }
}

/**
 * Check if a feature is enabled for a photographer
 */
export async function isFeatureEnabled(
  photographerId: string,
  featureCode: string
): Promise<boolean> {
  const value = await getFeatureValue(photographerId, featureCode);
  return value === true || value === 'true';
}
