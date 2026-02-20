export const dynamic = 'force-dynamic';

/**
 * Creator Usage API
 * 
 * Get real-time usage statistics and plan limits.
 */

import { NextResponse } from 'next/server';

import { getUsageSummary, checkLimit } from '@/lib/subscription/enforcement';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET - Get usage summary
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const serviceClient = createServiceClient();
    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    if (!creatorProfile?.id) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 404 });
    }
    const creatorId = creatorProfile.id as string;

    // Get comprehensive usage summary
    const usage = await getUsageSummary(creatorId);
    
    if (!usage) {
      // Return defaults if no usage data
      return NextResponse.json({
        usage: {
          activeEvents: 0,
          totalPhotos: 0,
          storageUsedGb: 0,
          teamMembers: 1,
          faceOpsUsed: 0,
        },
        limits: {
          maxEvents: 3,
          maxPhotosPerEvent: 100,
          maxStorageGb: 5,
          maxTeamMembers: 1,
          maxFaceOps: 500,
        },
        percentages: {
          events: 0,
          storage: 0,
          team: 0,
        },
        planCode: 'free',
        platformFee: 20,
      });
    }

    // Also get individual limit checks for more detailed info
    const [eventsCheck, storageCheck, teamCheck] = await Promise.all([
      checkLimit(creatorId, 'events'),
      checkLimit(creatorId, 'storage'),
      checkLimit(creatorId, 'team_members'),
    ]);

    return NextResponse.json({
      usage: {
        activeEvents: usage.activeEvents,
        totalPhotos: usage.totalPhotos,
        storageUsedGb: usage.storageUsedGb,
        teamMembers: usage.teamMembers,
        faceOpsUsed: usage.faceOpsUsed,
      },
      limits: {
        maxEvents: usage.maxEvents,
        maxPhotosPerEvent: usage.maxPhotosPerEvent,
        maxStorageGb: usage.maxStorageGb,
        maxTeamMembers: usage.maxTeamMembers,
        maxFaceOps: usage.maxFaceOps,
      },
      percentages: {
        events: usage.eventsPercent,
        storage: usage.storagePercent,
        team: usage.teamPercent,
      },
      checks: {
        events: {
          allowed: eventsCheck.allowed,
          message: eventsCheck.message,
        },
        storage: {
          allowed: storageCheck.allowed,
          message: storageCheck.message,
        },
        team: {
          allowed: teamCheck.allowed,
          message: teamCheck.message,
        },
      },
      planCode: usage.planCode,
      platformFee: usage.platformFee,
    });

  } catch (error) {
    console.error('Usage GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get usage' },
      { status: 500 }
    );
  }
}

