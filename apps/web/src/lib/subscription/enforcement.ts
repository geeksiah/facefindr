/**
 * Plan Enforcement Service
 * 
 * Enforces plan limits and feature flags at the API level.
 * Works in conjunction with database triggers for defense-in-depth.
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  message: string | null;
  percentage: number;
}

export interface UsageSummary {
  activeEvents: number;
  totalPhotos: number;
  storageUsedGb: number;
  teamMembers: number;
  faceOpsUsed: number;
  
  maxEvents: number;
  maxPhotosPerEvent: number;
  maxStorageGb: number;
  maxTeamMembers: number;
  maxFaceOps: number;
  
  eventsPercent: number;
  storagePercent: number;
  teamPercent: number;
  
  planCode: string;
  platformFee: number;
}

export interface PlanLimits {
  planCode: string;
  maxActiveEvents: number;
  maxPhotosPerEvent: number;
  maxFaceOpsPerEvent: number;
  storageGb: number;
  teamMembers: number;
  platformFeePercent: number;
  faceRecognitionEnabled: boolean;
  customWatermark: boolean;
  liveEventMode: boolean;
  apiAccess: boolean;
  advancedAnalytics: boolean;
  priorityProcessing: boolean;
}

export type LimitType = 'events' | 'photos' | 'face_ops' | 'storage' | 'team_members';
export type FeatureType =
  | 'face_recognition'
  | 'custom_watermark'
  | 'live_event_mode'
  | 'api_access'
  | 'advanced_analytics'
  | 'priority_processing';

// ============================================
// LIMIT CHECKING
// ============================================

/**
 * Check if an action is allowed based on plan limits
 */
export async function checkLimit(
  photographerId: string,
  limitType: LimitType,
  eventId?: string
): Promise<LimitCheck> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('check_limit', {
    p_photographer_id: photographerId,
    p_limit_type: limitType,
    p_event_id: eventId || null,
  });

  if (error) {
    console.error('Error checking limit:', error);
    // Fail open for database errors, but log for monitoring
    return {
      allowed: true,
      current: 0,
      limit: 0,
      message: null,
      percentage: 0,
    };
  }

  const result = data?.[0];
  return {
    allowed: result?.allowed ?? true,
    current: result?.current_value ?? 0,
    limit: result?.limit_value ?? 0,
    message: result?.message ?? null,
    percentage: result?.limit_value > 0 
      ? Math.min(100, Math.round((result?.current_value / result?.limit_value) * 100))
      : 0,
  };
}

/**
 * Check if a feature is enabled for the photographer
 */
export async function checkFeature(
  photographerId: string,
  feature: FeatureType
): Promise<boolean> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('check_feature', {
    p_photographer_id: photographerId,
    p_feature: feature,
  });

  if (error) {
    console.error('Error checking feature:', error);
    return false; // Fail closed for feature checks
  }

  return data === true;
}

/**
 * Get all limits for a photographer
 */
export async function getPlanLimits(photographerId: string): Promise<PlanLimits | null> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('get_photographer_limits', {
    p_photographer_id: photographerId,
  });

  if (error || !data?.[0]) {
    console.error('Error getting plan limits:', error);
    return null;
  }

  const row = data[0];
  return {
    planCode: row.plan_code,
    maxActiveEvents: row.max_active_events,
    maxPhotosPerEvent: row.max_photos_per_event,
    maxFaceOpsPerEvent: row.max_face_ops_per_event,
    storageGb: row.storage_gb,
    teamMembers: row.team_members,
    platformFeePercent: Number(row.platform_fee_percent),
    faceRecognitionEnabled: row.face_recognition_enabled,
    customWatermark: row.custom_watermark,
    liveEventMode: row.live_event_mode,
    apiAccess: row.api_access,
    advancedAnalytics: row.advanced_analytics ?? false,
    priorityProcessing: row.priority_processing ?? row.priority_support ?? false,
  };
}

/**
 * Get complete usage summary
 */
export async function getUsageSummary(photographerId: string): Promise<UsageSummary | null> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('get_usage_summary', {
    p_photographer_id: photographerId,
  });

  if (error || !data?.[0]) {
    console.error('Error getting usage summary:', error);
    return null;
  }

  const row = data[0];
  return {
    activeEvents: row.active_events,
    totalPhotos: row.total_photos,
    storageUsedGb: Number(row.storage_used_gb),
    teamMembers: row.team_members,
    faceOpsUsed: row.face_ops_used,
    
    maxEvents: row.max_events,
    maxPhotosPerEvent: row.max_photos_per_event,
    maxStorageGb: row.max_storage_gb,
    maxTeamMembers: row.max_team_members,
    maxFaceOps: row.max_face_ops,
    
    eventsPercent: row.events_percent,
    storagePercent: row.storage_percent,
    teamPercent: row.team_percent,
    
    planCode: row.plan_code,
    platformFee: Number(row.platform_fee),
  };
}

// ============================================
// ENFORCEMENT HELPERS
// ============================================

/**
 * Enforce event creation limit
 * Throws if limit exceeded
 */
export async function enforceEventLimit(photographerId: string): Promise<void> {
  const check = await checkLimit(photographerId, 'events');
  
  if (!check.allowed) {
    throw new LimitExceededError('events', check);
  }
}

/**
 * Enforce photo upload limit for an event
 * Throws if limit exceeded
 */
export async function enforcePhotoLimit(photographerId: string, eventId: string): Promise<void> {
  const check = await checkLimit(photographerId, 'photos', eventId);
  
  if (!check.allowed) {
    throw new LimitExceededError('photos', check);
  }
}

/**
 * Enforce storage limit
 * Throws if limit exceeded
 */
export async function enforceStorageLimit(photographerId: string): Promise<void> {
  const check = await checkLimit(photographerId, 'storage');
  
  if (!check.allowed) {
    throw new LimitExceededError('storage', check);
  }
}

/**
 * Enforce team member limit
 * Throws if limit exceeded
 */
export async function enforceTeamMemberLimit(photographerId: string): Promise<void> {
  const check = await checkLimit(photographerId, 'team_members');
  
  if (!check.allowed) {
    throw new LimitExceededError('team_members', check);
  }
}

/**
 * Enforce face recognition feature
 * Throws if not enabled
 */
export async function enforceFaceRecognition(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'face_recognition');
  
  if (!enabled) {
    throw new FeatureNotEnabledError('face_recognition');
  }
}

/**
 * Enforce face ops limit and increment counter
 */
export async function incrementFaceOps(eventId: string, count: number = 1): Promise<void> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.rpc('increment_face_ops', {
    p_event_id: eventId,
    p_count: count,
  });

  if (error) {
    console.error('Error incrementing face ops:', error);
    throw new Error('Failed to track face operations');
  }

  const result = data?.[0];
  if (!result?.success) {
    throw new LimitExceededError('face_ops', {
      allowed: false,
      current: result?.new_count ?? 0,
      limit: result?.limit_value ?? 0,
      message: result?.message ?? 'Face recognition limit exceeded',
      percentage: 100,
    });
  }
}

/**
 * Enforce custom watermark feature
 */
export async function enforceCustomWatermark(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'custom_watermark');
  
  if (!enabled) {
    throw new FeatureNotEnabledError('custom_watermark');
  }
}

/**
 * Enforce live event mode feature
 */
export async function enforceLiveEventMode(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'live_event_mode');
  
  if (!enabled) {
    throw new FeatureNotEnabledError('live_event_mode');
  }
}

/**
 * Enforce API access feature
 */
export async function enforceApiAccess(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'api_access');
  
  if (!enabled) {
    throw new FeatureNotEnabledError('api_access');
  }
}

/**
 * Enforce advanced analytics feature
 */
export async function enforceAdvancedAnalytics(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'advanced_analytics');

  if (!enabled) {
    throw new FeatureNotEnabledError('advanced_analytics');
  }
}

/**
 * Enforce priority processing feature
 */
export async function enforcePriorityProcessing(photographerId: string): Promise<void> {
  const enabled = await checkFeature(photographerId, 'priority_processing');

  if (!enabled) {
    throw new FeatureNotEnabledError('priority_processing');
  }
}

// ============================================
// CUSTOM ERRORS
// ============================================

export class LimitExceededError extends Error {
  public readonly limitType: LimitType;
  public readonly check: LimitCheck;
  public readonly code = 'LIMIT_EXCEEDED';

  constructor(limitType: LimitType, check: LimitCheck) {
    super(check.message || `${limitType} limit exceeded`);
    this.name = 'LimitExceededError';
    this.limitType = limitType;
    this.check = check;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      limitType: this.limitType,
      current: this.check.current,
      limit: this.check.limit,
      percentage: this.check.percentage,
    };
  }
}

export class FeatureNotEnabledError extends Error {
  public readonly feature: FeatureType;
  public readonly code = 'FEATURE_NOT_ENABLED';

  constructor(feature: FeatureType) {
    const featureNames: Record<FeatureType, string> = {
      face_recognition: 'Face Recognition',
      custom_watermark: 'Custom Watermark',
      live_event_mode: 'Live Event Mode',
      api_access: 'API Access',
      advanced_analytics: 'Advanced Analytics',
      priority_processing: 'Priority Processing',
    };
    
    super(`${featureNames[feature]} is not available on your current plan. Please upgrade to access this feature.`);
    this.name = 'FeatureNotEnabledError';
    this.feature = feature;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      feature: this.feature,
    };
  }
}

// ============================================
// RESPONSE HELPERS
// ============================================

/**
 * Handle enforcement errors in API routes
 */
export function handleEnforcementError(error: unknown): Response {
  if (error instanceof LimitExceededError) {
    return new Response(JSON.stringify(error.toJSON()), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (error instanceof FeatureNotEnabledError) {
    return new Response(JSON.stringify(error.toJSON()), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Re-throw unknown errors
  throw error;
}

/**
 * Check if error is an enforcement error
 */
export function isEnforcementError(error: unknown): error is LimitExceededError | FeatureNotEnabledError {
  return error instanceof LimitExceededError || error instanceof FeatureNotEnabledError;
}
