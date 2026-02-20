export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import {
  getCreatorPayoutSettings,
  updateCreatorPayoutSettings,
  getPayoutMinimum,
  MINIMUM_DISPLAY,
} from '@/lib/payments/payout-config';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient } from '@/lib/supabase/server';

// GET: Fetch photographer's payout settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(supabase, user.id, user.email);
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const settings = await getCreatorPayoutSettings(creatorProfile.id);

    // Get currency-specific minimum for display
    const minPayout = await getPayoutMinimum(settings.preferredCurrency);
    const minDisplay = MINIMUM_DISPLAY[settings.preferredCurrency] || `${settings.preferredCurrency} ${minPayout / 100}`;

    return NextResponse.json({
      settings,
      minimumPayout: minPayout,
      minimumPayoutDisplay: minDisplay,
      frequencies: [
        { value: 'daily', label: 'Daily', description: 'Payout every day at 2 AM' },
        { value: 'weekly', label: 'Weekly', description: 'Payout on your selected day each week' },
        { value: 'monthly', label: 'Monthly', description: 'Payout on your selected day each month' },
        { value: 'manual', label: 'Manual', description: 'Only when you request a payout' },
      ],
      weekDays: [
        { value: 1, label: 'Monday' },
        { value: 2, label: 'Tuesday' },
        { value: 3, label: 'Wednesday' },
        { value: 4, label: 'Thursday' },
        { value: 5, label: 'Friday' },
        { value: 6, label: 'Saturday' },
        { value: 7, label: 'Sunday' },
      ],
    });
  } catch (error) {
    console.error('Get payout settings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payout settings' },
      { status: 500 }
    );
  }
}

// PUT: Update photographer's payout settings
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(supabase, user.id, user.email);
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }

    const body = await request.json();

    // Validate frequency
    const validFrequencies = ['instant', 'daily', 'weekly', 'monthly', 'manual'];
    if (body.payoutFrequency && !validFrequencies.includes(body.payoutFrequency)) {
      return NextResponse.json(
        { error: 'Invalid payout frequency' },
        { status: 400 }
      );
    }

    // Validate weekly day
    if (body.weeklyPayoutDay && (body.weeklyPayoutDay < 1 || body.weeklyPayoutDay > 7)) {
      return NextResponse.json(
        { error: 'Weekly payout day must be 1-7' },
        { status: 400 }
      );
    }

    // Validate monthly day
    if (body.monthlyPayoutDay && (body.monthlyPayoutDay < 1 || body.monthlyPayoutDay > 28)) {
      return NextResponse.json(
        { error: 'Monthly payout day must be 1-28' },
        { status: 400 }
      );
    }

    const success = await updateCreatorPayoutSettings(creatorProfile.id, body);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    const updatedSettings = await getCreatorPayoutSettings(creatorProfile.id);

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    console.error('Update payout settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update payout settings' },
      { status: 500 }
    );
  }
}

