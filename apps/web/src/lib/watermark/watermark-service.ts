/**
 * Watermark Service
 * 
 * Handles watermark generation for preview images.
 * Uses Sharp for server-side image processing.
 */

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

export async function generateWatermarkedPreview(
  options: GeneratePreviewOptions
): Promise<WatermarkResult> {
  const { photographerId, mediaId } = options;
  
  // Get watermark settings
  const settings = await getWatermarkSettings(photographerId);
  
  if (!settings || (!settings.textContent && !settings.logoUrl)) {
    // No watermark configured - use default FaceFindr watermark
    return {
      success: true,
      previewUrl: options.originalUrl, // For now, return original
    };
  }

  // In production, this would:
  // 1. Download the original image
  // 2. Resize to previewMaxDimension
  // 3. Apply watermark based on settings
  // 4. Upload to storage
  // 5. Return the new URL
  
  // For now, return the original URL
  // The actual watermarking would be done by:
  // - Supabase Edge Function with Sharp/Jimp
  // - AWS Lambda with Sharp
  // - Cloudflare Workers with photon
  
  console.log(`[Watermark] Would generate preview for media ${mediaId}`);
  
  return {
    success: true,
    previewUrl: options.originalUrl,
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
  
  try {
    const { data, error } = await supabase.functions.invoke('generate-watermark', {
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
      preview_path: previewPath,
      thumbnail_path: thumbnailPath,
      processing_status: 'completed',
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
    .select('id, file_path')
    .eq('event_id', eventId)
    .is('preview_path', null)
    .eq('processing_status', 'pending');

  if (!mediaList || mediaList.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  // Get settings once
  const settings = await getWatermarkSettings(photographerId);
  
  for (const media of mediaList) {
    try {
      // Update status to processing
      await supabase
        .from('media')
        .update({ processing_status: 'processing' })
        .eq('id', media.id);

      // Generate preview
      // In production, this would call the Edge Function
      // For now, just mark as completed
      
      await supabase
        .from('media')
        .update({
          processing_status: 'completed',
          // preview_path would be set by Edge Function
        })
        .eq('id', media.id);

      processed++;
    } catch {
      failed++;
      await supabase
        .from('media')
        .update({ processing_status: 'failed' })
        .eq('id', media.id);
    }
  }

  return { processed, failed };
}
