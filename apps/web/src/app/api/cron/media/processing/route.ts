import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { indexFacesFromImage, isRekognitionConfigured } from '@/lib/aws/rekognition';
import { downloadStorageObject } from '@/lib/storage/provider';
import { checkFeature, incrementFaceOps } from '@/lib/subscription/enforcement';
import { createServiceClient } from '@/lib/supabase/server';
import { generateWatermarkedPreview } from '@/lib/watermark/watermark-service';

const CRON_SECRET = process.env.CRON_SECRET;

interface MediaProcessingJob {
  id: string;
  media_id: string;
  event_id: string | null;
  photographer_id: string | null;
  job_type: 'face_index' | 'watermark_generate';
  priority: 'high' | 'normal';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
}

function isStoragePath(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !/^https?:\/\//i.test(trimmed);
}

async function claimJobs(limit: number) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('media_processing_jobs')
    .select('*')
    .in('status', ['pending', 'failed'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  const claimed: MediaProcessingJob[] = [];

  for (const row of (data || []) as MediaProcessingJob[]) {
    if (row.attempt_count >= row.max_attempts) continue;
    const { data: updated } = await supabase
      .from('media_processing_jobs')
      .update({
        status: 'processing',
        claimed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .lt('attempt_count', row.max_attempts)
      .select('*')
      .maybeSingle();

    if (updated) {
      claimed.push(updated as MediaProcessingJob);
    }
  }

  return claimed;
}

async function processFaceIndexJob(supabase: ReturnType<typeof createServiceClient>, job: MediaProcessingJob) {
  if (!isRekognitionConfigured()) {
    return;
  }

  const { data: media } = await supabase
    .from('media')
    .select(`
      id,
      event_id,
      storage_path,
      faces_indexed,
      events!inner (
        id,
        photographer_id,
        face_recognition_enabled
      )
    `)
    .eq('id', job.media_id)
    .maybeSingle();

  if (!media) return;
  if (media.faces_indexed) return;

  const event = Array.isArray((media as any).events) ? (media as any).events[0] : (media as any).events;
  if (!event?.id || !event?.face_recognition_enabled) return;

  const imageBytes = await downloadStorageObject('media', media.storage_path, {
    supabaseClient: supabase,
  });
  const { indexedFaces, facesDetected, error } = await indexFacesFromImage(event.id, media.id, imageBytes);
  if (error) {
    throw new Error(error);
  }

  await supabase
    .from('face_embeddings')
    .delete()
    .eq('media_id', media.id);

  if (indexedFaces.length > 0) {
    const records = indexedFaces.map((face) => ({
      event_id: event.id,
      media_id: media.id,
      face_id: face.faceId,
      rekognition_face_id: face.faceId,
      bounding_box: face.boundingBox,
      confidence: face.confidence,
    }));

    const { error: insertError } = await supabase.from('face_embeddings').insert(records);
    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  await supabase
    .from('media')
    .update({
      faces_detected: facesDetected,
      faces_indexed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', media.id);

  try {
    await incrementFaceOps(event.id, facesDetected);
  } catch (error) {
    console.warn('[cron.media.processing] incrementFaceOps warning', error);
  }
}

async function processWatermarkJob(supabase: ReturnType<typeof createServiceClient>, job: MediaProcessingJob) {
  const { data: media } = await supabase
    .from('media')
    .select(`
      id,
      event_id,
      storage_path,
      events!inner (
        id,
        photographer_id,
        watermark_enabled
      )
    `)
    .eq('id', job.media_id)
    .maybeSingle();

  if (!media) return;

  const event = Array.isArray((media as any).events) ? (media as any).events[0] : (media as any).events;
  if (!event?.id) return;
  if (!event.watermark_enabled) return;

  const canUseCustomWatermark = await checkFeature(event.photographer_id, 'custom_watermark');
  if (!canUseCustomWatermark) return;

  const result = await generateWatermarkedPreview({
    originalUrl: media.storage_path,
    photographerId: event.photographer_id,
    mediaId: media.id,
  });

  if (!result.success) {
    throw new Error(result.error || 'Watermark generation failed');
  }

  const updates: Record<string, string> = {};
  if (isStoragePath(result.previewUrl || null)) {
    updates.watermarked_path = result.previewUrl!;
  }
  if (isStoragePath(result.thumbnailUrl || null)) {
    updates.thumbnail_path = result.thumbnailUrl!;
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from('media')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', media.id);
  }
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
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 20), 1), 100);
    const supabase = createServiceClient();

    const jobs = await claimJobs(limit);
    const stats = {
      claimed: jobs.length,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const job of jobs) {
      try {
        if (job.job_type === 'face_index') {
          await processFaceIndexJob(supabase, job);
        } else if (job.job_type === 'watermark_generate') {
          await processWatermarkJob(supabase, job);
        } else {
          stats.skipped += 1;
        }

        await supabase
          .from('media_processing_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        stats.completed += 1;
      } catch (error: any) {
        const nextAttempts = (job.attempt_count || 0) + 1;
        await supabase
          .from('media_processing_jobs')
          .update({
            status: 'failed',
            attempt_count: nextAttempts,
            last_error: error?.message || 'Unknown processing error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        stats.failed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[cron.media.processing] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process media jobs' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
