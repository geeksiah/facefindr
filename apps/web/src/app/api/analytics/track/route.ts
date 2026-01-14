/**
 * Analytics Track API
 * 
 * Track page views and interactions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackView, ViewType, DeviceType } from '@/lib/analytics';
import crypto from 'crypto';

// POST - Track a view
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { viewType, eventId, mediaId, photographerId, sessionId } = body;

    if (!viewType) {
      return NextResponse.json(
        { error: 'View type required' },
        { status: 400 }
      );
    }

    // Get user info if logged in
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get client info
    const ipAddress = request.ip || request.headers.get('x-forwarded-for') || '';
    const ipHash = crypto.createHash('sha256').update(ipAddress).digest('hex');
    
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';
    
    // Detect device type from user agent
    const deviceType = detectDeviceType(userAgent);
    
    // Get country from headers (Vercel/Cloudflare)
    const countryCode = request.headers.get('x-vercel-ip-country') || 
                        request.headers.get('cf-ipcountry') || 
                        undefined;

    // Determine viewer type
    let viewerType: 'photographer' | 'attendee' | 'anonymous' = 'anonymous';
    if (user) {
      const userMeta = user.user_metadata;
      viewerType = userMeta?.user_type || 'attendee';
    }

    const viewId = await trackView({
      viewType: viewType as ViewType,
      eventId,
      mediaId,
      photographerId,
      viewerId: user?.id,
      viewerType,
      ipHash,
      countryCode,
      deviceType,
      sessionId,
      userAgent,
      referrer,
    });

    return NextResponse.json({
      success: true,
      viewId,
    });

  } catch (error) {
    console.error('Track view error:', error);
    return NextResponse.json(
      { error: 'Failed to track view' },
      { status: 500 }
    );
  }
}

function detectDeviceType(userAgent: string): DeviceType {
  const ua = userAgent.toLowerCase();
  
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  
  return 'desktop';
}
