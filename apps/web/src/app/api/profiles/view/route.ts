export const dynamic = 'force-dynamic';

/**
 * Profile View Tracking API
 */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    const body = await request.json();
    const { profileId, profileType, source } = body;

    if (!profileId || !profileType) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Parse device type from user agent
    const headersList = await headers();
    const userAgent = headersList.get('user-agent') || '';
    let deviceType = 'desktop';
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(userAgent)) deviceType = 'tablet';

    await supabase.from('profile_views').insert({
      profile_id: profileId,
      profile_type: profileType,
      viewer_id: user?.id,
      source: source || 'direct',
      device_type: deviceType,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Track profile view error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

