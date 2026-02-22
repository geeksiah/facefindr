import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  copyStorageObjectBetweenBuckets,
  deleteStorageObjects,
} from '@/lib/storage/provider';
import { createServiceClient } from '@/lib/supabase/server';

const CRON_SECRET = process.env.CRON_SECRET;

type RetentionCandidate = {
  media_id: string;
  event_id: string | null;
  photographer_id: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  retention_days: number;
  event_end_at: string;
  retention_expires_at: string;
  grace_expires_at: string;
};

type RetentionRecord = {
  id: string;
  media_id: string;
  original_path: string;
  archive_path: string | null;
  status: 'soft_deleted' | 'archived' | 'recovered' | 'purged' | 'failed';
  purge_after: string | null;
};

type RecoverySettings = {
  grace_days: number;
  archive_retention_days: number;
  is_enabled: boolean;
};

function normalizePath(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^\/+/, '');
}

function buildArchivePath(candidate: RetentionCandidate, existingPath?: string | null) {
  const keep = normalizePath(existingPath);
  if (keep) return keep;

  const source = normalizePath(candidate.storage_path) || `${candidate.media_id}.bin`;
  const sourceName = source.split('/').pop() || `${candidate.media_id}.bin`;
  const photographerPart = candidate.photographer_id || 'unknown-photographer';
  const eventPart = candidate.event_id || 'unknown-event';
  return `retention/${photographerPart}/${eventPart}/${candidate.media_id}/${sourceName}`;
}

function addDays(baseIso: string, days: number) {
  const base = new Date(baseIso);
  base.setUTCDate(base.getUTCDate() + Math.max(0, days));
  return base.toISOString();
}

async function getRecoverySettings(supabase: ReturnType<typeof createServiceClient>): Promise<RecoverySettings> {
  const { data } = await supabase
    .from('media_recovery_settings')
    .select('grace_days, archive_retention_days, is_enabled')
    .eq('id', true)
    .maybeSingle();

  return {
    grace_days: Math.max(0, Number(data?.grace_days ?? 7)),
    archive_retention_days: Math.max(0, Number(data?.archive_retention_days ?? 30)),
    is_enabled: data?.is_enabled !== false,
  };
}

async function logRetentionState(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    mediaId: string;
    status: 'soft_deleted' | 'archived' | 'recovered' | 'purged' | 'failed';
    archivePath?: string | null;
    graceExpiresAt?: string | null;
    purgeAfter?: string | null;
    error?: string | null;
  }
) {
  const { error } = await supabase.rpc('log_media_retention_state', {
    p_media_id: input.mediaId,
    p_status: input.status,
    p_archive_path: input.archivePath || null,
    p_grace_expires_at: input.graceExpiresAt || null,
    p_purge_after: input.purgeAfter || null,
    p_last_error: input.error || null,
  });

  if (error) {
    console.error('[cron.media.retention] failed to log state', {
      mediaId: input.mediaId,
      status: input.status,
      error,
    });
  }
}

async function processRetentionCandidates(
  supabase: ReturnType<typeof createServiceClient>,
  rows: RetentionCandidate[],
  settings: RecoverySettings
) {
  const stats = {
    softDeleted: 0,
    archived: 0,
    alreadyHandled: 0,
    failed: 0,
  };

  for (const row of rows) {
    const mediaId = row.media_id;
    const sourcePath = normalizePath(row.storage_path);
    const graceExpiresAt = row.grace_expires_at || addDays(new Date().toISOString(), settings.grace_days);
    const purgeAfter = addDays(graceExpiresAt, settings.archive_retention_days);

    try {
      const { data: existingRecord } = await supabase
        .from('media_retention_records')
        .select('id, status, archive_path')
        .eq('media_id', mediaId)
        .maybeSingle();

      if (existingRecord?.status === 'archived' || existingRecord?.status === 'purged') {
        stats.alreadyHandled += 1;
        continue;
      }

      await supabase
        .from('media')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', mediaId)
        .is('deleted_at', null);

      stats.softDeleted += 1;
      await logRetentionState(supabase, {
        mediaId,
        status: 'soft_deleted',
        graceExpiresAt,
        purgeAfter,
      });

      if (!sourcePath) {
        await logRetentionState(supabase, {
          mediaId,
          status: 'failed',
          graceExpiresAt,
          purgeAfter,
          error: 'Missing source storage path',
        });
        stats.failed += 1;
        continue;
      }

      const archivePath = buildArchivePath(row, existingRecord?.archive_path || null);

      await copyStorageObjectBetweenBuckets('media', sourcePath, 'media-archive', archivePath);

      const { data: mediaPaths } = await supabase
        .from('media')
        .select('storage_path, thumbnail_path, watermarked_path')
        .eq('id', mediaId)
        .maybeSingle();

      const pathsToDelete = Array.from(
        new Set(
          [mediaPaths?.storage_path, mediaPaths?.thumbnail_path, mediaPaths?.watermarked_path]
            .map((path) => normalizePath(path))
            .filter(Boolean) as string[]
        )
      );

      if (pathsToDelete.length > 0) {
        await deleteStorageObjects('media', pathsToDelete);
      }

      await supabase
        .from('media')
        .update({
          thumbnail_path: null,
          watermarked_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mediaId);

      await logRetentionState(supabase, {
        mediaId,
        status: 'archived',
        archivePath,
        graceExpiresAt,
        purgeAfter,
      });

      stats.archived += 1;
    } catch (error: any) {
      await logRetentionState(supabase, {
        mediaId,
        status: 'failed',
        graceExpiresAt,
        purgeAfter,
        error: error?.message || 'Retention processing failed',
      });
      stats.failed += 1;
    }
  }

  return stats;
}

async function purgeArchivedMedia(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number
) {
  const nowIso = new Date().toISOString();
  const stats = {
    candidates: 0,
    purged: 0,
    skippedRecoveryHold: 0,
    failed: 0,
  };

  const { data, error } = await supabase
    .from('media_retention_records')
    .select('id, media_id, original_path, archive_path, status, purge_after')
    .in('status', ['archived', 'soft_deleted', 'failed'])
    .not('purge_after', 'is', null)
    .lte('purge_after', nowIso)
    .order('purge_after', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const records = (data || []) as RetentionRecord[];
  stats.candidates = records.length;

  for (const record of records) {
    try {
      const { data: activeRecovery } = await supabase
        .from('media_recovery_requests')
        .select('id, status, expires_at')
        .eq('retention_record_id', record.id)
        .in('status', ['pending_payment', 'paid', 'restoring'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeRecovery?.id) {
        const expiresAt = activeRecovery.expires_at ? new Date(activeRecovery.expires_at) : null;
        if (!expiresAt || expiresAt > new Date()) {
          stats.skippedRecoveryHold += 1;
          continue;
        }
      }

      const archivePath = normalizePath(record.archive_path);
      if (archivePath) {
        await deleteStorageObjects('media-archive', [archivePath]);
      }

      const originalPath = normalizePath(record.original_path);
      if (originalPath) {
        await deleteStorageObjects('media', [originalPath]).catch(() => {});
      }

      await supabase.from('face_embeddings').delete().eq('media_id', record.media_id);
      await supabase
        .from('media')
        .update({
          thumbnail_path: null,
          watermarked_path: null,
          updated_at: nowIso,
        })
        .eq('id', record.media_id);

      await logRetentionState(supabase, {
        mediaId: record.media_id,
        status: 'purged',
        archivePath: archivePath,
      });

      stats.purged += 1;
    } catch (error: any) {
      await logRetentionState(supabase, {
        mediaId: record.media_id,
        status: 'failed',
        archivePath: record.archive_path,
        error: error?.message || 'Purge failed',
      });
      stats.failed += 1;
    }
  }

  return stats;
}

async function runRetention(limit: number) {
  const supabase = createServiceClient();
  const settings = await getRecoverySettings(supabase);

  if (!settings.is_enabled) {
    return {
      success: true,
      skipped: true,
      reason: 'media_recovery_settings.is_enabled=false',
      timestamp: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase.rpc('select_media_for_retention', {
    p_limit: limit,
  });
  if (error) {
    throw error;
  }

  const candidates = (data || []) as RetentionCandidate[];
  const retainStats = await processRetentionCandidates(supabase, candidates, settings);
  const purgeStats = await purgeArchivedMedia(supabase, limit);

  return {
    success: true,
    settings,
    scanned: candidates.length,
    retention: retainStats,
    purge: purgeStats,
    timestamp: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
    }

    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 2000);
    const result = await runRetention(limit);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[cron.media.retention] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process media retention' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
