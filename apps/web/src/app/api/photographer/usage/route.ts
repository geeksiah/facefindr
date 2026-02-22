export const dynamic = 'force-dynamic';

/**
 * Creator Usage API
 * 
 * Get real-time usage statistics and plan limits.
 */

import { NextResponse } from 'next/server';

import { getPlanByCode, getUserPlan } from '@/lib/subscription';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const BYTES_PER_GB = 1024 * 1024 * 1024;
const STORAGE_OBJECT_CHUNK_SIZE = 200;

function toNonNegativeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function parseStorageObjectSize(metadata: any): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const candidates = [metadata.size, metadata.fileSize, metadata.contentLength, metadata.length];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function chunkPaths(paths: string[], chunkSize: number): string[][] {
  if (paths.length <= chunkSize) return [paths];
  const chunks: string[][] = [];
  for (let i = 0; i < paths.length; i += chunkSize) {
    chunks.push(paths.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getStorageBytesFromObjects(serviceClient: any, storagePaths: string[]): Promise<number> {
  if (!storagePaths.length) return 0;

  let totalBytes = 0;
  for (const chunk of chunkPaths(storagePaths, STORAGE_OBJECT_CHUNK_SIZE)) {
    const { data, error } = await serviceClient
      .schema('storage')
      .from('objects')
      .select('name, metadata')
      .eq('bucket_id', 'media')
      .in('name', chunk);
    if (error) {
      console.error('Usage fallback objects query failed:', error);
      continue;
    }
    for (const row of data || []) {
      totalBytes += parseStorageObjectSize((row as any)?.metadata);
    }
  }

  return totalBytes;
}

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
    const nowIso = new Date().toISOString();

    const [subscriptionResult, usageResult, limitsResult] = await Promise.all([
      serviceClient
        .from('subscriptions')
        .select('plan_id, plan_code')
        .eq('photographer_id', creatorId)
        .in('status', ['active', 'trialing'])
        .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from('photographer_usage')
        .select(
          'active_events_count, total_photos_count, storage_used_bytes, active_team_members, total_face_ops'
        )
        .eq('photographer_id', creatorId)
        .maybeSingle(),
      serviceClient.rpc('get_photographer_limits', {
        p_photographer_id: creatorId,
      }),
    ]);

    const activeSubscription = subscriptionResult.data || null;
    const subscriptionPlanId = (activeSubscription as any)?.plan_id || null;

    const limitsRow = Array.isArray(limitsResult.data) ? limitsResult.data[0] : null;
    const limitsError = limitsResult.error;
    const usageRow = usageResult.data;

    const activeEvents = toNonNegativeNumber((usageRow as any)?.active_events_count);
    let totalPhotos = toNonNegativeNumber((usageRow as any)?.total_photos_count);
    let storageUsedBytes = toNonNegativeNumber((usageRow as any)?.storage_used_bytes);
    const teamMembers = Math.max(1, toNonNegativeNumber((usageRow as any)?.active_team_members, 1));
    const faceOpsUsed = toNonNegativeNumber((usageRow as any)?.total_face_ops);

    // Self-heal stale counters once when photos exist but bytes stayed at 0.
    // This keeps the hot path fast while fixing old deployments with drifted usage rows.
    if (storageUsedBytes <= 0 && totalPhotos > 0) {
      const { data: mediaRows, error: mediaError } = await serviceClient
        .from('media')
        .select('file_size, storage_path, events!inner(photographer_id)')
        .eq('events.photographer_id', creatorId)
        .is('deleted_at', null);

      if (mediaError) {
        console.error('Usage fallback media query failed:', mediaError);
      } else {
        const rows: any[] = Array.isArray(mediaRows) ? mediaRows : [];
        const authoritativePhotos = rows.length;
        let authoritativeBytes = rows.reduce(
          (sum: number, row: any) => sum + toNonNegativeNumber(row?.file_size),
          0
        );

        if (authoritativeBytes <= 0 && authoritativePhotos > 0) {
          const storagePaths = Array.from(
            new Set(
              rows
                .map((row: any) =>
                  typeof row?.storage_path === 'string' ? row.storage_path.trim() : ''
                )
                .filter((path: string) => path.length > 0)
            )
          );
          const objectBytes = await getStorageBytesFromObjects(serviceClient, storagePaths);
          if (objectBytes > 0) {
            authoritativeBytes = objectBytes;
          }
        }

        if (authoritativePhotos > 0 || authoritativeBytes > 0) {
          totalPhotos = authoritativePhotos;
          storageUsedBytes = authoritativeBytes;
          const { error: syncError } = await serviceClient
            .from('photographer_usage')
            .upsert(
              {
                photographer_id: creatorId,
                total_photos_count: authoritativePhotos,
                storage_used_bytes: authoritativeBytes,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'photographer_id' }
            );
          if (syncError) {
            console.error('Usage fallback cache sync failed:', syncError);
          }
        }
      }
    }

    const storageUsedGb = storageUsedBytes / BYTES_PER_GB;

    if (!limitsRow || limitsError) {
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
          activeEvents,
          totalPhotos,
          storageUsedGb: storageUsedGb,
          storageUsedBytes,
          teamMembers,
          faceOpsUsed,
        },
        limits: {
          ...resolvedPlanLimits,
        },
        percentages: {
          events:
            resolvedPlanLimits.maxEvents > 0 && resolvedPlanLimits.maxEvents !== -1
              ? Math.min(100, Math.max(0, Math.round((activeEvents * 100) / resolvedPlanLimits.maxEvents)))
              : 0,
          storage:
            resolvedPlanLimits.maxStorageGb > 0 && resolvedPlanLimits.maxStorageGb !== -1
              ? Math.min(
                  100,
                  Math.max(
                    0,
                    Math.round((storageUsedBytes * 100) / (resolvedPlanLimits.maxStorageGb * BYTES_PER_GB))
                  )
                )
              : 0,
          team:
            resolvedPlanLimits.maxTeamMembers > 0 && resolvedPlanLimits.maxTeamMembers !== -1
              ? Math.min(100, Math.max(0, Math.round((teamMembers * 100) / resolvedPlanLimits.maxTeamMembers)))
              : 0,
        },
        planId: subscriptionPlanId || currentPlan?.id || freePlan?.id || null,
        planCode: resolvedPlanCode,
        platformFee: resolvedPlatformFee,
      });
    }

    const maxEvents = Number(limitsRow.max_active_events || 0);
    const maxPhotosPerEvent = Number(limitsRow.max_photos_per_event || 0);
    const maxStorageGb = Number(limitsRow.storage_gb || 0);
    const maxTeamMembers = Number(limitsRow.team_members || 1);
    const maxFaceOps = Number(limitsRow.max_face_ops_per_event || 0);
    const planCode = String(limitsRow.plan_code || String(activeSubscription?.plan_code || 'free'));
    const platformFee = Number(limitsRow.platform_fee_percent || 20);

    const eventsPercent =
      maxEvents > 0 && maxEvents !== -1 ? Math.min(100, Math.max(0, Math.round((activeEvents * 100) / maxEvents))) : 0;
    const storagePercent =
      maxStorageGb > 0 && maxStorageGb !== -1
        ? Math.min(100, Math.max(0, Math.round((storageUsedBytes * 100) / (maxStorageGb * BYTES_PER_GB))))
        : 0;
    const teamPercent =
      maxTeamMembers > 0 && maxTeamMembers !== -1
        ? Math.min(100, Math.max(0, Math.round((teamMembers * 100) / maxTeamMembers)))
        : 0;

    return NextResponse.json({
      usage: {
        activeEvents,
        totalPhotos,
        storageUsedGb,
        storageUsedBytes,
        teamMembers,
        faceOpsUsed,
      },
      limits: {
        maxEvents,
        maxPhotosPerEvent,
        maxStorageGb,
        maxTeamMembers,
        maxFaceOps,
      },
      percentages: {
        events: eventsPercent,
        storage: storagePercent,
        team: teamPercent,
      },
      planId: subscriptionPlanId,
      planCode,
      platformFee,
    });

  } catch (error) {
    console.error('Usage GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get usage' },
      { status: 500 }
    );
  }
}

