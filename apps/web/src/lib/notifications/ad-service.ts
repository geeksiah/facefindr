/**
 * Ad Service
 * 
 * Handles system ad placements for admin promotions, new features, etc.
 */

import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface AdPlacement {
  placementCode: string;
  placementName: string;
  description: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: string | null;
  pagePath: string | null;
  position: string | null;
}

export interface AdCampaign {
  id: string;
  headline: string | null;
  bodyText: string | null;
  imageUrl: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  accentColor: string | null;
}

// ============================================
// PLACEMENT CODES
// ============================================

export const AD_PLACEMENTS = {
  DASHBOARD_BANNER: 'dashboard_banner',
  DASHBOARD_SIDEBAR: 'dashboard_sidebar',
  GALLERY_BANNER: 'gallery_banner',
  GALLERY_INLINE: 'gallery_inline',
  CHECKOUT_SIDEBAR: 'checkout_sidebar',
  EVENT_PAGE_BANNER: 'event_page_banner',
  SETTINGS_INLINE: 'settings_inline',
  MOBILE_BOTTOM_SHEET: 'mobile_bottom_sheet',
} as const;

export type AdPlacementCode = typeof AD_PLACEMENTS[keyof typeof AD_PLACEMENTS];

// ============================================
// GET AD FOR PLACEMENT
// ============================================

export interface GetAdOptions {
  placementCode: AdPlacementCode;
  userType?: 'photographer' | 'attendee';
  userPlan?: string;
  userCountry?: string;
}

export async function getAdForPlacement(options: GetAdOptions): Promise<AdCampaign | null> {
  const { placementCode, userType, userPlan, userCountry } = options;
  const supabase = createServiceClient();

  // Use database function for efficient lookup with targeting
  const { data, error } = await supabase.rpc('get_active_ad', {
    p_placement_code: placementCode,
    p_user_type: userType || null,
    p_user_plan: userPlan || null,
    p_user_country: userCountry || null,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const ad = data[0];
  return {
    id: ad.campaign_id,
    headline: ad.headline,
    bodyText: ad.body_text,
    imageUrl: ad.image_url,
    ctaText: ad.cta_text,
    ctaUrl: ad.cta_url,
    backgroundColor: ad.background_color,
    textColor: ad.text_color,
    accentColor: ad.accent_color,
  };
}

// ============================================
// TRACK IMPRESSION
// ============================================

export async function trackImpression(campaignId: string): Promise<void> {
  const supabase = createServiceClient();

  await supabase.rpc('increment', {
    table_name: 'ad_campaigns',
    column_name: 'impressions',
    row_id: campaignId,
  });
}

// ============================================
// TRACK CLICK
// ============================================

export async function trackClick(campaignId: string): Promise<void> {
  const supabase = createServiceClient();

  await supabase.rpc('increment', {
    table_name: 'ad_campaigns',
    column_name: 'clicks',
    row_id: campaignId,
  });
}

// ============================================
// GET ALL PLACEMENTS (Admin)
// ============================================

export async function getAllPlacements(): Promise<AdPlacement[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('ad_placements')
    .select('*')
    .order('placement_name');

  if (!data) return [];

  return data.map(p => ({
    placementCode: p.placement_code,
    placementName: p.placement_name,
    description: p.description,
    width: p.width,
    height: p.height,
    aspectRatio: p.aspect_ratio,
    pagePath: p.page_path,
    position: p.position,
  }));
}

// ============================================
// CLIENT-SIDE HOOK DATA
// ============================================

export interface AdData {
  hasAd: boolean;
  campaign: AdCampaign | null;
  placement: AdPlacementCode;
}

// This is used by the client-side hook
export function createAdData(
  placement: AdPlacementCode,
  campaign: AdCampaign | null
): AdData {
  return {
    hasAd: campaign !== null,
    campaign,
    placement,
  };
}
