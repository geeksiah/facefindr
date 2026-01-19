/**
 * Event Sharing Service
 * 
 * Manages share links, access codes, and public event settings.
 */

import { createClient } from '@/lib/supabase/server';

import { generateQRCode, generateEventUrls, generateEmbedCode } from './qr-service';

interface ShareLinkOptions {
  label?: string;
  requireCode?: boolean;
  accessCode?: string;
  expiresAt?: Date;
  maxUses?: number;
  linkType?: 'direct' | 'qr_code' | 'embed' | 'social';
}

interface PublicEventSettings {
  isPubliclyListed?: boolean;
  allowAnonymousScan?: boolean;
  requireAccessCode?: boolean;
  publicAccessCode?: string;
  customSlug?: string;
}

/**
 * Generate a random access code
 */
export function generateAccessCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (I, O, 0, 1)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Create a share link for an event
 */
export async function createShareLink(
  eventId: string,
  options: ShareLinkOptions = {}
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase = await createClient();
    
    // Generate unique token
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { data, error } = await supabase
      .from('event_share_links')
      .insert({
        event_id: eventId,
        token,
        label: options.label,
        link_type: options.linkType || 'direct',
        require_code: options.requireCode || false,
        access_code: options.accessCode,
        expires_at: options.expiresAt?.toISOString(),
        max_uses: options.maxUses,
      })
      .select()
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Create share link error:', error);
    return { success: false, error: 'Failed to create share link' };
  }
}

/**
 * Get share links for an event
 */
export async function getShareLinks(
  eventId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('event_share_links')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Get share links error:', error);
    return { success: false, error: 'Failed to get share links' };
  }
}

/**
 * Validate share link and access code
 */
export async function validateShareLink(
  token: string,
  accessCode?: string
): Promise<{ success: boolean; event?: any; error?: string }> {
  try {
    const supabase = await createClient();
    
    // Get share link with event
    const { data: link, error } = await supabase
      .from('event_share_links')
      .select(`
        *,
        events (
          id, name, date, location, cover_image_url, photographer_id,
          status, public_slug, is_publicly_listed, allow_anonymous_scan,
          photographers (display_name, profile_photo_url)
        )
      `)
      .eq('token', token)
      .eq('is_active', true)
      .single();
    
    if (error || !link) {
      return { success: false, error: 'Invalid or expired link' };
    }
    
    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return { success: false, error: 'This link has expired' };
    }
    
    // Check max uses
    if (link.max_uses && link.use_count >= link.max_uses) {
      return { success: false, error: 'This link has reached its maximum uses' };
    }
    
    // Check access code
    if (link.require_code) {
      if (!accessCode || accessCode !== link.access_code) {
        return { success: false, error: 'Invalid access code' };
      }
    }
    
    // Check event status
    if (link.events.status !== 'active') {
      return { success: false, error: 'This event is no longer active' };
    }
    
    return { success: true, event: link.events };
  } catch (error) {
    console.error('Validate share link error:', error);
    return { success: false, error: 'Failed to validate link' };
  }
}

/**
 * Update public event settings
 */
export async function updatePublicEventSettings(
  eventId: string,
  settings: PublicEventSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    
    const updateData: Record<string, any> = {};
    
    if (settings.isPubliclyListed !== undefined) {
      updateData.is_publicly_listed = settings.isPubliclyListed;
    }
    if (settings.allowAnonymousScan !== undefined) {
      updateData.allow_anonymous_scan = settings.allowAnonymousScan;
    }
    if (settings.requireAccessCode !== undefined) {
      updateData.require_access_code = settings.requireAccessCode;
    }
    if (settings.publicAccessCode !== undefined) {
      updateData.public_access_code = settings.publicAccessCode;
    }
    if (settings.customSlug !== undefined) {
      updateData.public_slug = settings.customSlug;
    }
    
    const { error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Update public settings error:', error);
    return { success: false, error: 'Failed to update settings' };
  }
}

/**
 * Get public event by slug or short link
 */
export async function getPublicEvent(
  identifier: string,
  accessCode?: string
): Promise<{ success: boolean; event?: any; photos?: any[]; error?: string }> {
  try {
    const supabase = await createClient();
    
    // Try to find by slug or short link
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        id, name, description, date, end_date, location, cover_image_url,
        status, public_slug, short_link, is_publicly_listed, allow_anonymous_scan,
        require_access_code, public_access_code, currency_code,
        photographers (id, display_name, profile_photo_url, bio)
      `)
      .or(`public_slug.eq.${identifier},short_link.eq.${identifier}`)
      .eq('status', 'active')
      .single();
    
    if (error || !event) {
      return { success: false, error: 'Event not found' };
    }
    
    // Check access code if required
    if (event.require_access_code) {
      if (!accessCode || accessCode !== event.public_access_code) {
        return { 
          success: false, 
          error: 'access_code_required',
          event: { 
            name: event.name, 
            cover_image_url: event.cover_image_url,
            require_access_code: true 
          }
        };
      }
    }
    
    // Get photos (watermarked thumbnails only for public view)
    const { data: photos } = await supabase
      .from('media')
      .select('id, thumbnail_path, created_at')
      .eq('event_id', event.id)
      .eq('is_processed', true)
      .order('created_at', { ascending: false })
      .limit(100);
    
    // Get photo count
    const { count: photoCount } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('is_processed', true);
    
    return { 
      success: true, 
      event: { ...event, photo_count: photoCount || 0 }, 
      photos: photos || [] 
    };
  } catch (error) {
    console.error('Get public event error:', error);
    return { success: false, error: 'Failed to load event' };
  }
}

/**
 * Track event visit
 */
export async function trackEventVisit(
  eventId: string,
  shareLinkId?: string,
  metadata?: {
    referrer?: string;
    userAgent?: string;
    action?: string;
  }
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Parse user agent for device info (simplified)
    const userAgent = metadata?.userAgent || '';
    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(userAgent)) deviceType = 'tablet';
    
    let browser = 'unknown';
    if (/chrome/i.test(userAgent)) browser = 'chrome';
    else if (/firefox/i.test(userAgent)) browser = 'firefox';
    else if (/safari/i.test(userAgent)) browser = 'safari';
    else if (/edge/i.test(userAgent)) browser = 'edge';
    
    await supabase.from('event_link_analytics').insert({
      event_id: eventId,
      share_link_id: shareLinkId,
      referrer: metadata?.referrer,
      user_agent: metadata?.userAgent,
      device_type: deviceType,
      browser,
      action: metadata?.action || 'view',
    });
  } catch (error) {
    console.error('Track visit error:', error);
    // Non-blocking, don't throw
  }
}

/**
 * Get sharing analytics for an event
 */
export async function getEventShareAnalytics(
  eventId: string,
  days: number = 30
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const supabase = await createClient();
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get total views
    const { count: totalViews } = await supabase
      .from('event_link_analytics')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('action', 'view')
      .gte('created_at', startDate.toISOString());
    
    // Get unique visitors (approximate)
    const { data: uniqueData } = await supabase
      .from('event_link_analytics')
      .select('visitor_hash')
      .eq('event_id', eventId)
      .gte('created_at', startDate.toISOString());
    
    const uniqueVisitors = new Set(uniqueData?.map(d => d.visitor_hash).filter(Boolean)).size;
    
    // Get scans
    const { count: totalScans } = await supabase
      .from('event_link_analytics')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('action', 'scan')
      .gte('created_at', startDate.toISOString());
    
    // Get device breakdown
    const { data: deviceData } = await supabase
      .from('event_link_analytics')
      .select('device_type')
      .eq('event_id', eventId)
      .gte('created_at', startDate.toISOString());
    
    const deviceBreakdown = deviceData?.reduce((acc, d) => {
      const type = d.device_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};
    
    // Get share link performance
    const { data: linkPerformance } = await supabase
      .from('event_share_links')
      .select('id, label, link_type, use_count, created_at')
      .eq('event_id', eventId)
      .order('use_count', { ascending: false });
    
    return {
      success: true,
      data: {
        totalViews: totalViews || 0,
        uniqueVisitors,
        totalScans: totalScans || 0,
        deviceBreakdown,
        linkPerformance: linkPerformance || [],
      },
    };
  } catch (error) {
    console.error('Get share analytics error:', error);
    return { success: false, error: 'Failed to get analytics' };
  }
}
