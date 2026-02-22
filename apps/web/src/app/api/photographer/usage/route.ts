export const dynamic = 'force-dynamic';

/**
 * Creator Usage API
 * 
 * Get real-time usage statistics and plan limits.
 */

import { NextResponse } from 'next/server';

import { getUsageSummary } from '@/lib/subscription/enforcement';
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

    const { data: mediaRows, error: mediaUsageError } = await serviceClient
      .from('media')
      .select('file_size, events!inner(photographer_id)')
      .eq('events.photographer_id', creatorId)
      .is('deleted_at', null);
    const authoritativeTotalPhotos = mediaUsageError
      ? null
      : Number((mediaRows || []).length);
    const authoritativeStorageBytes = mediaUsageError
      ? null
      : (mediaRows || []).reduce(
          (sum: number, row: any) => sum + Math.max(0, Number(row?.file_size || 0)),
          0
        );
    const authoritativeStorageGb =
      authoritativeStorageBytes === null ? null : authoritativeStorageBytes / (1024 * 1024 * 1024);

    // Get comprehensive usage summary
    const usage = await getUsageSummary(creatorId);

    const nowIso = new Date().toISOString();
    const { data: subscriptionRows } = await serviceClient
      .from('subscriptions')
      .select('plan_id, plan_code')
      .eq('photographer_id', creatorId)
      .in('status', ['active', 'trialing'])
      .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);
    const activeSubscription =
      subscriptionRows?.find((row: any) => String(row.plan_code || '').toLowerCase() !== 'free') ||
      subscriptionRows?.[0] ||
      null;
    const subscriptionPlanId = (activeSubscription as any)?.plan_id || null;
    
    if (!usage) {
      const currentPlan = await getUserPlan(creatorId, 'photographer');
      const freePlan = await getPlanByCode('free', 'creator');
      const resolvedPlanCode = currentPlan?.code || freePlan?.code || 'free';
      const resolvedPlanLimits = {
        maxEvents: currentPlan?.limits.maxActiveEvents ?? freePlan?.limits.maxActiveEvents ?? 1,
        maxPhotosPerEvent: currentPlan?.limits.maxPhotosPerEvent ?? freePlan?.limits.maxPhotosPerEvent ?? 50,
        maxStorageGb: currentPlan?.limits.storageGb ?? freePlan?.limits.storageGb ?? 1,
        maxTeamMembers: currentPlan?.limits.teamMembers ?? freePlan?.limits.teamMembers ?? 1,
        maxFaceOps: currentPlan?.limits.maxFaceOpsPerEvent ?? freePlan?.limits.maxFaceOpsPerEvent ?? 0,
      };
      const resolvedPlatformFee = currentPlan?.platformFeePercent ?? freePlan?.platformFeePercent ?? 20;
      // Return defaults if no usage data
      return NextResponse.json({
        usage: {
          activeEvents: 0,
          totalPhotos: authoritativeTotalPhotos ?? 0,
          storageUsedGb: authoritativeStorageGb ?? 0,
          teamMembers: 1,
          faceOpsUsed: 0,
        },
        limits: {
          ...resolvedPlanLimits,
        },
        percentages: {
          events: 0,
          storage:
            authoritativeStorageGb !== null && (resolvedPlanLimits.maxStorageGb ?? 0) > 0
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    Math.round((authoritativeStorageGb * 100) / Number(resolvedPlanLimits.maxStorageGb || 1))
                  )
                )
              : 0,
          team: 0,
        },
        planId: subscriptionPlanId || currentPlan?.id || freePlan?.id || null,
        planCode: resolvedPlanCode,
        platformFee: resolvedPlatformFee,
      });
    }

    return NextResponse.json({
      usage: {
        activeEvents: usage.activeEvents,
        totalPhotos: authoritativeTotalPhotos ?? usage.totalPhotos,
        storageUsedGb: authoritativeStorageGb ?? usage.storageUsedGb,
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
        events: Math.min(100, Math.max(0, Number(usage.eventsPercent || 0))),
        storage:
          authoritativeStorageGb !== null && Number(usage.maxStorageGb || 0) > 0
            ? Math.min(
                100,
                Math.max(0, Math.round((authoritativeStorageGb * 100) / Number(usage.maxStorageGb || 1)))
              )
            : Math.min(100, Math.max(0, Number(usage.storagePercent || 0))),
        team: Math.min(100, Math.max(0, Number(usage.teamPercent || 0))),
      },
      planId: subscriptionPlanId,
      planCode: usage.planCode || String(activeSubscription?.plan_code || 'free'),
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

