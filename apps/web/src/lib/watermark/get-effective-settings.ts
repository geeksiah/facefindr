/**
 * Get Effective Watermark Settings
 * 
 * Returns watermark settings with admin overrides applied.
 * Admin settings take precedence over photographer settings.
 */

import { createClient } from '@/lib/supabase/server';

import { getWatermarkSettings, WatermarkSettings } from './watermark-service';

export async function getEffectiveWatermarkSettings(
  photographerId: string,
  eventId?: string
): Promise<WatermarkSettings | null> {
  const supabase = createClient();

  // Get photographer's watermark settings
  const photographerSettings = await getWatermarkSettings(photographerId);

  // Check for admin overrides on event level
  if (eventId) {
    const { data: adminOverride } = await supabase
      .from('admin_event_settings')
      .select('watermark_enabled, watermark_settings')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .single();

    if (adminOverride?.watermark_settings) {
      // Admin has overridden settings for this event
      return {
        ...photographerSettings!,
        ...adminOverride.watermark_settings,
        photographerId, // Preserve photographer ID
      };
    }

    // Check if admin has disabled watermarking for this event
    if (adminOverride?.watermark_enabled === false) {
      return null; // Watermarking disabled by admin
    }
  }

  // Check for global admin watermark settings override
  const { data: globalAdminSettings } = await supabase
    .from('admin_settings')
    .select('watermark_settings_override')
    .eq('setting_key', 'watermark')
    .eq('is_active', true)
    .single();

  if (globalAdminSettings?.watermark_settings_override) {
    // Admin has global override
    return {
      ...photographerSettings!,
      ...globalAdminSettings.watermark_settings_override,
      photographerId,
    };
  }

  return photographerSettings;
}
