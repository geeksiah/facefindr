/**
 * Public Event API
 * 
 * Fetches event data for public viewing (no auth required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient();
    const { slug } = params;
    const { searchParams } = new URL(request.url);
    const accessCode = searchParams.get('code');

    // Find event by slug or short link
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        id, name, description, date, end_date, location, cover_image_url,
        status, public_slug, short_link, is_publicly_listed, allow_anonymous_scan,
        require_access_code, public_access_code, currency_code,
        photographers (id, display_name, profile_photo_url, bio)
      `)
      .or(`public_slug.eq.${slug},short_link.eq.${slug}`)
      .eq('status', 'active')
      .single();

    if (error || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Check access code if required
    if (event.require_access_code) {
      if (!accessCode || accessCode.toUpperCase() !== event.public_access_code?.toUpperCase()) {
        return NextResponse.json({
          error: 'access_code_required',
          event: {
            name: event.name,
            cover_image_url: event.cover_image_url,
            require_access_code: true,
          },
        }, { status: 403 });
      }
    }

    // Get photos (thumbnails only for preview)
    const { data: photos } = await supabase
      .from('media')
      .select('id, thumbnail_path, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .limit(100);

    // Get photo count
    const { count: photoCount } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id);

    // Track visit (non-blocking)
    trackVisit(supabase, event.id, request).catch(console.error);

    // Clean up sensitive data
    const publicEvent = {
      id: event.id,
      name: event.name,
      description: event.description,
      date: event.date,
      end_date: event.end_date,
      location: event.location,
      cover_image_url: event.cover_image_url,
      photo_count: photoCount || 0,
      allow_anonymous_scan: event.allow_anonymous_scan,
      photographers: event.photographers,
      currency_code: event.currency_code,
    };

    return NextResponse.json({
      event: publicEvent,
      photos: photos || [],
    });

  } catch (error) {
    console.error('Public event error:', error);
    return NextResponse.json(
      { error: 'Failed to load event' },
      { status: 500 }
    );
  }
}

async function trackVisit(supabase: any, eventId: string, request: NextRequest) {
  try {
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    const referrer = headersList.get('referer') || '';

    // Parse device type
    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(userAgent)) deviceType = 'tablet';

    // Parse browser
    let browser = 'unknown';
    if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) browser = 'chrome';
    else if (/firefox/i.test(userAgent)) browser = 'firefox';
    else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'safari';
    else if (/edge/i.test(userAgent)) browser = 'edge';

    await supabase.from('event_link_analytics').insert({
      event_id: eventId,
      referrer,
      user_agent: userAgent.substring(0, 500),
      device_type: deviceType,
      browser,
      action: 'view',
    });
  } catch (e) {
    // Non-blocking
  }
}
