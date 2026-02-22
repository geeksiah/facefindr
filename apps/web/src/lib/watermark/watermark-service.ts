/**
 * Watermark Service
 * 
 * Handles watermark generation for preview images.
 * Delegates rendering to an async watermark worker (Edge Function).
 */

import { createStorageSignedUrl } from '@/lib/storage/provider';
import { createServiceClient } from '@/lib/supabase/server';

// ============================================
// TYPES
// ============================================

export interface WatermarkSettings {
  id: string;
  photographerId: string;
  watermarkType: 'text' | 'logo' | 'both';
  
  // Text settings
  textContent: string | null;
  textFont: string;
  textSize: number;
  textColor: string;
  textOpacity: number;
  
  // Logo settings
  logoUrl: string | null;
  logoWidth: number;
  logoOpacity: number;
  
  // Position
  position: 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'tile';
  margin: number;
  
  // Tile pattern
  tileSpacing: number;
  tileAngle: number;
  
  // Preview quality
  previewQuality: number;
  previewMaxDimension: number;
}

export interface WatermarkResult {
  success: boolean;
  previewUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

// ============================================
// DEFAULT SETTINGS
// ============================================

export const DEFAULT_WATERMARK_SETTINGS: Omit<WatermarkSettings, 'id' | 'photographerId'> = {
  watermarkType: 'text',
  textContent: null,
  textFont: 'Arial',
  textSize: 24,
  textColor: '#FFFFFF',
  textOpacity: 0.5,
  logoUrl: null,
  logoWidth: 150,
  logoOpacity: 0.5,
  position: 'center',
  margin: 20,
  tileSpacing: 100,
  tileAngle: -30,
  previewQuality: 60,
  previewMaxDimension: 1200,
};

// ============================================
// GET WATERMARK SETTINGS
// ============================================

export async function getWatermarkSettings(photographerId: string): Promise<WatermarkSettings | null> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('watermark_settings')
    .select('*')
    .eq('photographer_id', photographerId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    photographerId: data.photographer_id,
    watermarkType: data.watermark_type,
    textContent: data.text_content,
    textFont: data.text_font,
    textSize: data.text_size,
    textColor: data.text_color,
    textOpacity: Number(data.text_opacity),
    logoUrl: data.logo_url,
    logoWidth: data.logo_width,
    logoOpacity: Number(data.logo_opacity),
    position: data.position,
    margin: data.margin,
    tileSpacing: data.tile_spacing,
    tileAngle: data.tile_angle,
    previewQuality: data.preview_quality,
    previewMaxDimension: data.preview_max_dimension,
  };
}

// ============================================
// SAVE WATERMARK SETTINGS
// ============================================

export async function saveWatermarkSettings(
  photographerId: string,
  settings: Partial<Omit<WatermarkSettings, 'id' | 'photographerId'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();

  const updateData = {
    watermark_type: settings.watermarkType,
    text_content: settings.textContent,
    text_font: settings.textFont,
    text_size: settings.textSize,
    text_color: settings.textColor,
    text_opacity: settings.textOpacity,
    logo_url: settings.logoUrl,
    logo_width: settings.logoWidth,
    logo_opacity: settings.logoOpacity,
    position: settings.position,
    margin: settings.margin,
    tile_spacing: settings.tileSpacing,
    tile_angle: settings.tileAngle,
    preview_quality: settings.previewQuality,
    preview_max_dimension: settings.previewMaxDimension,
  };

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key as keyof typeof updateData] === undefined) {
      delete updateData[key as keyof typeof updateData];
    }
  });

  const { error } = await supabase
    .from('watermark_settings')
    .upsert({
      photographer_id: photographerId,
      ...updateData,
    }, {
      onConflict: 'photographer_id',
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ============================================
// GENERATE WATERMARKED PREVIEW
// This is a placeholder - actual implementation needs Sharp
// In production, this would be an Edge Function or separate service
// ============================================

export interface GeneratePreviewOptions {
  originalUrl: string;
  photographerId: string;
  mediaId: string;
}

function hasTextWatermark(settings: WatermarkSettings): boolean {
  return typeof settings.textContent === 'string' && settings.textContent.trim().length > 0;
}

function normalizeStorageLikePath(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/^\/+/, '');
}

async function resolveLogoInput(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  const trimmed = logoUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const logoPath = normalizeStorageLikePath(trimmed);
  if (!logoPath) return null;
  return createStorageSignedUrl('branding', logoPath, 60 * 15);
}

export async function generateWatermarkedPreview(
  options: GeneratePreviewOptions
): Promise<WatermarkResult> {
  const { photographerId, mediaId } = options;

  const settings = await getWatermarkSettings(photographerId);
  if (!settings) {
    return { success: true };
  }

  const hasText = hasTextWatermark(settings);
  const hasLogo = Boolean(settings.logoUrl);
  const shouldApply =
    (settings.watermarkType === 'text' && hasText) ||
    (settings.watermarkType === 'logo' && hasLogo) ||
    (settings.watermarkType === 'both' && (hasText || hasLogo));

  if (!shouldApply) {
    return { success: true };
  }

  const supabase = createServiceClient();
  const { data: media, error: mediaError } = await supabase
    .from('media')
    .select('id, storage_path')
    .eq('id', mediaId)
    .maybeSingle();

  if (mediaError || !media?.storage_path) {
    return {
      success: false,
      error: mediaError?.message || 'Source media path not found',
    };
  }

  const resolvedLogoUrl = await resolveLogoInput(settings.logoUrl);
  const workerSettings: WatermarkSettings = {
    ...settings,
    logoUrl: resolvedLogoUrl || settings.logoUrl,
  };

  const response = await callWatermarkFunction({
    mediaId,
    photographerId,
    originalPath: media.storage_path,
    settings: workerSettings,
  });

  if (!response.success) {
    return {
      success: false,
      error: response.error || 'Watermark processor failed',
    };
  }

  if (!response.previewPath && !response.thumbnailPath) {
    return {
      success: false,
      error: 'Watermark processor did not return preview outputs',
    };
  }

  return {
    success: true,
    previewUrl: response.previewPath,
    thumbnailUrl: response.thumbnailPath,
  };
}

// ============================================
// SUPABASE EDGE FUNCTION PLACEHOLDER
// This shows the expected interface for the Edge Function
// ============================================

export interface WatermarkRequest {
  mediaId: string;
  photographerId: string;
  originalPath: string;
  settings: WatermarkSettings;
}

export interface WatermarkResponse {
  success: boolean;
  previewPath?: string;
  thumbnailPath?: string;
  error?: string;
}

/**
 * Call the watermark Edge Function
 * 
 * The Edge Function would:
 * 1. Fetch the original image from Supabase Storage
 * 2. Use Sharp to resize and watermark
 * 3. Upload preview and thumbnail back to Storage
 * 4. Return the new paths
 */
export async function callWatermarkFunction(
  request: WatermarkRequest
): Promise<WatermarkResponse> {
  const supabase = createServiceClient();
  const functionName = process.env.WATERMARK_FUNCTION_NAME || 'generate-watermark';
  
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: request,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return data as WatermarkResponse;
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

// ============================================
// UPDATE MEDIA WITH PREVIEW PATHS
// ============================================

export async function updateMediaPreviews(
  mediaId: string,
  previewPath: string,
  thumbnailPath: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  
  const { error } = await supabase
    .from('media')
    .update({
      watermarked_path: previewPath,
      thumbnail_path: thumbnailPath,
    })
    .eq('id', mediaId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ============================================
// BATCH PROCESS MEDIA
// ============================================

export async function batchGeneratePreviews(
  photographerId: string,
  eventId: string
): Promise<{ processed: number; failed: number }> {
  const supabase = createServiceClient();
  
  // Get all media without previews
  const { data: mediaList } = await supabase
    .from('media')
    .select('id, storage_path')
    .eq('event_id', eventId)
    .is('watermarked_path', null)
    .is('deleted_at', null);

  if (!mediaList || mediaList.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  // Get settings once
  const settings = await getWatermarkSettings(photographerId);
  
  for (const media of mediaList) {
    try {
      const result = await generateWatermarkedPreview({
        originalUrl: media.storage_path,
        photographerId,
        mediaId: media.id,
      });

      if (!result.success || (!result.previewUrl && !result.thumbnailUrl)) {
        failed++;
        continue;
      }

      const previewPath = result.previewUrl || media.storage_path;
      const thumbnailPath = result.thumbnailUrl || result.previewUrl || media.storage_path;
      await updateMediaPreviews(media.id, previewPath, thumbnailPath);

      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}
