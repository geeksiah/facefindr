/**
 * Download Service
 * 
 * Handles secure downloads, entitlement checks, and download tracking.
 */

import { createServiceClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// ============================================
// TYPES
// ============================================

export type Resolution = 'web' | 'standard' | 'full' | 'raw';

export interface Entitlement {
  id: string;
  attendeeId: string;
  mediaId: string | null;
  eventId: string | null;
  entitlementType: 'single_photo' | 'event_all' | 'gifted' | 'free_preview';
  resolution: Resolution;
  includeRaw: boolean;
  purchaseId: string | null;
  giftedBy: string | null;
  giftMessage: string | null;
  downloadLimit: number | null;
  downloadsUsed: number;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface DownloadToken {
  token: string;
  entitlementId: string;
  mediaId: string;
  resolution: Resolution;
  expiresAt: Date;
  downloadUrl: string;
}

export interface EntitlementCheck {
  hasAccess: boolean;
  entitlementId: string | null;
  maxResolution: Resolution | null;
  downloadsRemaining: number | null;
  expiresAt: Date | null;
}

// ============================================
// RESOLUTION HIERARCHY
// ============================================

const RESOLUTION_ORDER: Record<Resolution, number> = {
  web: 1,
  standard: 2,
  full: 3,
  raw: 4,
};

const RESOLUTION_DIMENSIONS: Record<Resolution, number> = {
  web: 1200,
  standard: 2400,
  full: 0, // Original
  raw: 0, // Original + RAW
};

export function canAccessResolution(
  ownedResolution: Resolution,
  requestedResolution: Resolution
): boolean {
  return RESOLUTION_ORDER[ownedResolution] >= RESOLUTION_ORDER[requestedResolution];
}

// ============================================
// CHECK ENTITLEMENT
// ============================================

export async function checkEntitlement(
  attendeeId: string,
  mediaId: string,
  requestedResolution: Resolution = 'web'
): Promise<EntitlementCheck> {
  const supabase = createServiceClient();
  
  // Use database function for efficient check
  const { data, error } = await supabase.rpc('check_entitlement', {
    p_attendee_id: attendeeId,
    p_media_id: mediaId,
    p_resolution: requestedResolution,
  });

  if (error || !data || data.length === 0) {
    return {
      hasAccess: false,
      entitlementId: null,
      maxResolution: null,
      downloadsRemaining: null,
      expiresAt: null,
    };
  }

  const row = data[0];
  return {
    hasAccess: row.has_access,
    entitlementId: row.entitlement_id,
    maxResolution: row.max_resolution,
    downloadsRemaining: row.downloads_remaining,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

// ============================================
// GET ALL ENTITLEMENTS FOR ATTENDEE
// ============================================

export async function getAttendeeEntitlements(
  attendeeId: string,
  eventId?: string
): Promise<Entitlement[]> {
  const supabase = createServiceClient();
  
  let query = supabase
    .from('entitlements')
    .select('*')
    .eq('attendee_id', attendeeId)
    .eq('is_active', true);

  if (eventId) {
    query = query.or(`event_id.eq.${eventId},media_id.in.(select id from media where event_id='${eventId}')`);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    id: row.id,
    attendeeId: row.attendee_id,
    mediaId: row.media_id,
    eventId: row.event_id,
    entitlementType: row.entitlement_type,
    resolution: row.resolution,
    includeRaw: row.include_raw,
    purchaseId: row.purchase_id,
    giftedBy: row.gifted_by,
    giftMessage: row.gift_message,
    downloadLimit: row.download_limit,
    downloadsUsed: row.downloads_used,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    isActive: row.is_active,
  }));
}

// ============================================
// CREATE ENTITLEMENT
// ============================================

export interface CreateEntitlementOptions {
  attendeeId: string;
  mediaId?: string;
  eventId?: string;
  entitlementType: 'single_photo' | 'event_all' | 'gifted' | 'free_preview';
  resolution: Resolution;
  includeRaw?: boolean;
  purchaseId?: string;
  giftedBy?: string;
  giftMessage?: string;
  downloadLimit?: number;
  expiryDays?: number;
}

export async function createEntitlement(
  options: CreateEntitlementOptions
): Promise<{ success: boolean; entitlementId?: string; error?: string }> {
  const supabase = createServiceClient();
  
  const expiresAt = options.expiryDays
    ? new Date(Date.now() + options.expiryDays * 24 * 60 * 60 * 1000)
    : null;

  const { data, error } = await supabase
    .from('entitlements')
    .insert({
      attendee_id: options.attendeeId,
      media_id: options.mediaId || null,
      event_id: options.eventId || null,
      entitlement_type: options.entitlementType,
      resolution: options.resolution,
      include_raw: options.includeRaw || false,
      purchase_id: options.purchaseId || null,
      gifted_by: options.giftedBy || null,
      gift_message: options.giftMessage || null,
      download_limit: options.downloadLimit || null,
      expires_at: expiresAt?.toISOString() || null,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, entitlementId: data.id };
}

// ============================================
// GENERATE DOWNLOAD TOKEN
// ============================================

export async function generateDownloadToken(
  attendeeId: string,
  mediaId: string,
  resolution: Resolution,
  ipAddress?: string
): Promise<{ success: boolean; token?: DownloadToken; error?: string }> {
  const supabase = createServiceClient();
  
  // Check entitlement first
  const entitlementCheck = await checkEntitlement(attendeeId, mediaId, resolution);
  
  if (!entitlementCheck.hasAccess || !entitlementCheck.entitlementId) {
    return { success: false, error: 'No access to this photo at requested resolution' };
  }

  // Check download limits
  if (entitlementCheck.downloadsRemaining !== null && entitlementCheck.downloadsRemaining <= 0) {
    return { success: false, error: 'Download limit reached' };
  }

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store token
  const { error: insertError } = await supabase
    .from('download_tokens')
    .insert({
      token,
      entitlement_id: entitlementCheck.entitlementId,
      media_id: mediaId,
      resolution,
      attendee_id: attendeeId,
      ip_address: ipAddress || null,
      expires_at: expiresAt.toISOString(),
      max_uses: 1,
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Generate download URL
  const downloadUrl = `/api/download/${token}`;

  return {
    success: true,
    token: {
      token,
      entitlementId: entitlementCheck.entitlementId,
      mediaId,
      resolution,
      expiresAt,
      downloadUrl,
    },
  };
}

// ============================================
// VALIDATE AND USE DOWNLOAD TOKEN
// ============================================

export interface ValidatedToken {
  isValid: boolean;
  mediaId?: string;
  resolution?: Resolution;
  filePath?: string;
  attendeeId?: string;
  entitlementId?: string;
  error?: string;
}

export async function validateAndUseToken(
  token: string,
  ipAddress?: string
): Promise<ValidatedToken> {
  const supabase = createServiceClient();
  
  // Get token
  const { data: tokenData, error: tokenError } = await supabase
    .from('download_tokens')
    .select(`
      *,
      media:media_id (
        id,
        file_path,
        preview_path,
        event_id
      )
    `)
    .eq('token', token)
    .single();

  if (tokenError || !tokenData) {
    return { isValid: false, error: 'Invalid token' };
  }

  // Check expiry
  if (new Date(tokenData.expires_at) < new Date()) {
    return { isValid: false, error: 'Token expired' };
  }

  // Check uses
  if (tokenData.uses >= tokenData.max_uses) {
    return { isValid: false, error: 'Token already used' };
  }

  // Check IP if restricted
  if (tokenData.ip_address && ipAddress && tokenData.ip_address !== ipAddress) {
    return { isValid: false, error: 'IP address mismatch' };
  }

  // Increment uses
  const { error: updateError } = await supabase
    .from('download_tokens')
    .update({ uses: tokenData.uses + 1 })
    .eq('id', tokenData.id);

  if (updateError) {
    return { isValid: false, error: 'Failed to update token' };
  }

  // Increment download count on entitlement
  await supabase.rpc('increment', {
    table_name: 'entitlements',
    column_name: 'downloads_used',
    row_id: tokenData.entitlement_id,
  });

  // Determine file path based on resolution
  let filePath: string;
  const resolution = tokenData.resolution as Resolution;
  
  if (resolution === 'web' || resolution === 'standard') {
    // Use preview/resized version
    filePath = tokenData.media.preview_path || tokenData.media.file_path;
  } else {
    // Use original
    filePath = tokenData.media.file_path;
  }

  // Log download
  await supabase.from('download_history').insert({
    attendee_id: tokenData.attendee_id,
    entitlement_id: tokenData.entitlement_id,
    media_id: tokenData.media_id,
    resolution,
    ip_address: ipAddress || null,
  });

  return {
    isValid: true,
    mediaId: tokenData.media_id,
    resolution,
    filePath,
    attendeeId: tokenData.attendee_id,
    entitlementId: tokenData.entitlement_id,
  };
}

// ============================================
// GET SIGNED DOWNLOAD URL
// ============================================

export async function getSignedDownloadUrl(
  filePath: string,
  expiresIn: number = 300 // 5 minutes
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase.storage
    .from('media')
    .createSignedUrl(filePath, expiresIn, {
      download: true,
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, url: data.signedUrl };
}

// ============================================
// BULK DOWNLOAD (ZIP)
// ============================================

export interface BulkDownloadRequest {
  attendeeId: string;
  mediaIds: string[];
  resolution: Resolution;
}

export async function prepareBulkDownload(
  request: BulkDownloadRequest
): Promise<{ success: boolean; downloadUrls?: { mediaId: string; url: string }[]; error?: string }> {
  const { attendeeId, mediaIds, resolution } = request;
  
  const downloadUrls: { mediaId: string; url: string }[] = [];
  
  for (const mediaId of mediaIds) {
    const tokenResult = await generateDownloadToken(attendeeId, mediaId, resolution);
    
    if (tokenResult.success && tokenResult.token) {
      downloadUrls.push({
        mediaId,
        url: tokenResult.token.downloadUrl,
      });
    }
  }

  if (downloadUrls.length === 0) {
    return { success: false, error: 'No accessible photos' };
  }

  return { success: true, downloadUrls };
}

// ============================================
// CLEANUP EXPIRED TOKENS
// ============================================

export async function cleanupExpiredTokens(): Promise<number> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('download_tokens')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  return data?.length || 0;
}
