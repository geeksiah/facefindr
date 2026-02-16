export const dynamic = 'force-dynamic';

/**
 * Ads API
 * 
 * Get ads for specific placements and track impressions/clicks.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getAdForPlacement,
  trackImpression,
  trackClick,
  AdPlacementCode,
} from '@/lib/notifications';
import { getCreatorPlan } from '@/lib/subscription';
import { normalizeUserType } from '@/lib/user-type';
import { createClient } from '@/lib/supabase/server';

// GET - Get ad for placement
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const placement = searchParams.get('placement') as AdPlacementCode;
    const userCountry = searchParams.get('country') || undefined;

    if (!placement) {
      return NextResponse.json(
        { error: 'Placement code required' },
        { status: 400 }
      );
    }

    // Get user info for targeting
    let userType: 'creator' | 'attendee' | undefined;
    let userPlan: string | undefined;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const userData = user.user_metadata;
      userType = normalizeUserType(userData?.user_type) || undefined;
      
      if (userType === 'creator') {
        userPlan = await getCreatorPlan(user.id);
      }
    }

    const ad = await getAdForPlacement({
      placementCode: placement,
      userType,
      userPlan,
      userCountry,
    });

    if (!ad) {
      return NextResponse.json({ ad: null });
    }

    // Track impression
    await trackImpression(ad.id);

    return NextResponse.json({ ad });

  } catch (error) {
    console.error('Ads GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get ad' },
      { status: 500 }
    );
  }
}

// POST - Track click
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID required' },
        { status: 400 }
      );
    }

    await trackClick(campaignId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Ads POST error:', error);
    return NextResponse.json(
      { error: 'Failed to track click' },
      { status: 500 }
    );
  }
}

