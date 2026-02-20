export const dynamic = 'force-dynamic';

/**
 * Creator Usage API
 * 
 * Get real-time usage statistics and plan limits.
 */

import { NextResponse } from 'next/server';

import { getUsageSummary, checkLimit } from '@/lib/subscription/enforcement';
import { getPlanByCode, getUserPlan } from '@/lib/subscription';
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
    const currentPlan = await getUserPlan(creatorId, 'photographer');
    const freePlan = await getPlanByCode('free', 'creator');
    const resolvedPlanId = currentPlan?.id || freePlan?.id || null;
    const resolvedPlanCode = currentPlan?.code || freePlan?.code || 'free';
    const resolvedPlanLimits = {
      maxEvents: currentPlan?.limits.maxActiveEvents ?? freePlan?.limits.maxActiveEvents ?? 1,
      maxPhotosPerEvent: currentPlan?.limits.maxPhotosPerEvent ?? freePlan?.limits.maxPhotosPerEvent ?? 50,
      maxStorageGb: currentPlan?.limits.storageGb ?? freePlan?.limits.storageGb ?? 1,
      maxTeamMembers: currentPlan?.limits.teamMembers ?? freePlan?.limits.teamMembers ?? 1,
      maxFaceOps: currentPlan?.limits.maxFaceOpsPerEvent ?? freePlan?.limits.maxFaceOpsPerEvent ?? 0,
    };
    const resolvedPlatformFee = currentPlan?.platformFeePercent ?? freePlan?.platformFeePercent ?? 20;

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
          ...resolvedPlanLimits,
        },
        percentages: {
          events: 0,
          storage: 0,
          team: 0,
        },
        planId: resolvedPlanId,
        planCode: resolvedPlanCode,
        platformFee: resolvedPlatformFee,
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
        maxEvents: resolvedPlanLimits.maxEvents,
        maxPhotosPerEvent: resolvedPlanLimits.maxPhotosPerEvent,
        maxStorageGb: resolvedPlanLimits.maxStorageGb,
        maxTeamMembers: resolvedPlanLimits.maxTeamMembers,
        maxFaceOps: resolvedPlanLimits.maxFaceOps,
      },
      percentages: {
        events:
          resolvedPlanLimits.maxEvents === -1
            ? 0
            : Math.min(100, Math.round((usage.activeEvents * 100) / Math.max(1, resolvedPlanLimits.maxEvents))),
        storage:
          resolvedPlanLimits.maxStorageGb === -1
            ? 0
            : Math.min(
                100,
                Math.round((Number(usage.storageUsedGb || 0) * 100) / Math.max(0.01, resolvedPlanLimits.maxStorageGb))
              ),
        team:
          resolvedPlanLimits.maxTeamMembers === -1
            ? 0
            : Math.min(100, Math.round((usage.teamMembers * 100) / Math.max(1, resolvedPlanLimits.maxTeamMembers))),
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
      planId: resolvedPlanId,
      planCode: resolvedPlanCode,
      platformFee: resolvedPlatformFee,
    });

  } catch (error) {
    console.error('Usage GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get usage' },
      { status: 500 }
    );
  }
}

