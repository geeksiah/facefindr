'use server';

import { revalidatePath } from 'next/cache';

import { deleteFaces } from '@/lib/aws/rekognition';
import { dispatchInAppNotification } from '@/lib/notifications/dispatcher';
import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { checkFeature, checkLimit } from '@/lib/subscription/enforcement';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const BYTES_PER_GB = 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`;
}

async function getCreatorStorageLimitBytes(
  serviceClient: any,
  photographerId: string
): Promise<number | null> {
  const { data, error } = await serviceClient.rpc('get_photographer_limits', {
    p_photographer_id: photographerId,
  });
  if (error) {
    console.error('Failed to resolve creator storage limits:', error);
    return null;
  }

  const storageGb = Number(data?.[0]?.storage_gb);
  if (!Number.isFinite(storageGb)) return null;
  if (storageGb === -1) return -1;
  return Math.max(0, Math.floor(storageGb * BYTES_PER_GB));
}

async function getCreatorStorageUsedBytes(
  serviceClient: any,
  photographerId: string
): Promise<number> {
  // Authoritative source for storage usage is the media table.
  // Cached counters can drift when deployments miss older trigger migrations.
  const { data: mediaRows, error } = await serviceClient
    .from('media')
    .select('file_size, events!inner(photographer_id)')
    .eq('events.photographer_id', photographerId)
    .is('deleted_at', null);
  if (error) {
    console.error('Failed to compute creator storage usage fallback:', error);
    return 0;
  }

  return (mediaRows || []).reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.file_size || 0)),
    0
  );
}

async function checkCreatorStorageForIncomingUpload(
  serviceClient: any,
  photographerId: string,
  incomingFileSizeBytes: number
): Promise<{
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  message: string | null;
}> {
  const limitBytes = await getCreatorStorageLimitBytes(serviceClient, photographerId);
  if (limitBytes === null) {
    return {
      allowed: true,
      usedBytes: 0,
      limitBytes: 0,
      message: null,
    };
  }
  if (limitBytes === -1) {
    return {
      allowed: true,
      usedBytes: 0,
      limitBytes: -1,
      message: null,
    };
  }

  const usedBytes = await getCreatorStorageUsedBytes(serviceClient, photographerId);
  const projectedBytes = usedBytes + Math.max(0, Number(incomingFileSizeBytes || 0));
  const allowed = projectedBytes <= limitBytes;
  return {
    allowed,
    usedBytes,
    limitBytes,
    message: allowed
      ? null
      : `Storage limit reached (${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}). Please upgrade your plan or delete some photos.`,
  };
}

function isSupabaseNotFound(error: any): boolean {
  return error?.code === 'PGRST116';
}

function isSupabaseTransportOrUpstreamError(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();

  return (
    code.startsWith('08') ||
    code === '57014' ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('name_not_resolved') ||
    message.includes('connection') ||
    details.includes('network')
  );
}

async function notifyEventSubscribersAboutNewPhotos(
  serviceClient: any,
  event: { id: string; name?: string | null; public_slug?: string | null; status?: string | null },
  mediaId: string
) {
  if (!event?.id || event.status !== 'active') return;

  const [{ data: consentRows, error: consentError }, { data: entitlementRows, error: entitlementError }] =
    await Promise.all([
      serviceClient
        .from('attendee_consents')
        .select('attendee_id')
        .eq('event_id', event.id)
        .eq('consent_type', 'biometric')
        .is('withdrawn_at', null),
      serviceClient
        .from('entitlements')
        .select('attendee_id')
        .eq('event_id', event.id),
    ]);

  if (consentError || entitlementError) {
    console.error('Subscriber lookup failed:', consentError || entitlementError);
    return;
  }

  const attendeeIds = Array.from(
    new Set(
      [...(consentRows || []), ...(entitlementRows || [])]
        .map((row: any) => row.attendee_id)
        .filter(Boolean)
    )
  ) as string[];

  if (!attendeeIds.length) return;

  const eventName = event.name || 'Your event';
  const eventPath = event.public_slug ? `/e/${event.public_slug}` : `/e/${event.id}`;
  const dedupeKey = `event_new_photos:${event.id}:${mediaId}`;

  await Promise.all(
    attendeeIds.map((attendeeId) =>
      dispatchInAppNotification({
        supabase: serviceClient,
        recipientUserId: attendeeId,
        templateCode: 'event_new_photos',
        subject: `${eventName}: new photos added`,
        body: `New photos were posted for ${eventName}.`,
        dedupeKey,
        actionUrl: `/gallery/events/${event.id}`,
        details: {
          eventId: event.id,
          eventName,
          eventPath,
          mediaId,
        },
        metadata: {
          type: 'event_new_photos',
          eventId: event.id,
          eventName,
          eventPath,
          mediaId,
        },
        eligibilityContext: {
          eventId: event.id,
          requireEventParticipant: true,
        },
      })
    )
  );
}

// ============================================
// UPLOAD PHOTOS
// ============================================

export async function uploadPhotos(formData: FormData) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  const photographerIdCandidates = await getPhotographerIdCandidates(supabase, user.id, user.email);
  const { data: actorPhotographerProfile } = await resolvePhotographerProfileByUser(
    supabase,
    user.id,
    user.email
  );
  if (!actorPhotographerProfile?.id) {
    return { success: false, error: 'Creator profile not found' };
  }
  const actorPhotographerId = actorPhotographerProfile.id as string;

  const file = formData.get('file') as File;
  const eventId = formData.get('eventId') as string;

  if (!file || !eventId) {
    return { success: false, error: 'Missing file or event ID' };
  }

  // Verify event access - either owner or collaborator with upload permission
  const { data: event, error: eventError } = await serviceClient
    .from('events')
      .select('id, name, public_slug, status, photographer_id, face_recognition_enabled')
      .eq('id', eventId)
      .maybeSingle();

  if (eventError) {
    console.error('Event lookup failed during upload:', { eventId, userId: user.id, error: eventError });
    if (isSupabaseNotFound(eventError)) {
      return {
        success: false,
        error: 'This event is no longer available.',
        code: 'EVENT_NOT_FOUND',
      };
    }
    if (isSupabaseTransportOrUpstreamError(eventError)) {
      return {
        success: false,
        error: 'Connection issue. Retrying usually fixes this.',
        code: 'UPSTREAM_UNAVAILABLE',
      };
    }
    return {
      success: false,
      error: eventError.message || 'Failed to load event details for upload.',
      code: 'UPLOAD_FAILED',
    };
  }

  if (!event) {
    return {
      success: false,
      error: 'This event is no longer available.',
      code: 'EVENT_NOT_FOUND',
    };
  }

  // Check if user is owner or collaborator with upload permission
  let canUpload = photographerIdCandidates.includes(event.photographer_id);
  const photographerId = event.photographer_id; // Use event owner for limit checks
  
  if (!canUpload) {
    // Check collaborator permissions
    const { data: collaborator, error: collaboratorError } = await serviceClient
      .from('event_collaborators')
      .select('can_upload')
      .eq('event_id', eventId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'active')
      .maybeSingle();

    if (collaboratorError && !isSupabaseNotFound(collaboratorError)) {
      console.error('Collaborator upload permission lookup failed:', {
        eventId,
        userId: user.id,
        error: collaboratorError,
      });
      if (isSupabaseTransportOrUpstreamError(collaboratorError)) {
        return {
          success: false,
          error: 'Connection issue. Retrying usually fixes this.',
          code: 'UPSTREAM_UNAVAILABLE',
        };
      }
      return {
        success: false,
        error: collaboratorError.message || 'Failed to verify upload permissions.',
        code: 'UPLOAD_FAILED',
      };
    }
    
    canUpload = collaborator?.can_upload === true;
  }

  if (!canUpload) {
    return {
      success: false,
      error: 'You do not have permission to upload to this event.',
      code: 'NOT_AUTHORIZED',
    };
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: 'Invalid file type. Only JPEG, PNG, HEIC, and WebP are allowed.',
      code: 'UPLOAD_FAILED',
    };
  }

  // Validate file size (50MB max)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { success: false, error: 'File too large. Maximum size is 50MB.', code: 'UPLOAD_FAILED' };
  }

  // ENFORCE: Check photo limit using the enforcement system
  const photoLimit = await checkLimit(photographerId, 'photos', eventId);
  if (!photoLimit.allowed) {
    return {
      success: false,
      error: photoLimit.message || `You've reached your photo limit for this event (${photoLimit.limit} photos). Please upgrade your plan.`,
      code: 'LIMIT_EXCEEDED',
      limitType: 'photos',
      current: photoLimit.current,
      limit: photoLimit.limit,
    };
  }

  // ENFORCE: Check storage limit with precise byte-level guardrail.
  const storageLimit = await checkCreatorStorageForIncomingUpload(serviceClient, photographerId, file.size);
  if (!storageLimit.allowed) {
    return {
      success: false,
      error:
        storageLimit.message ||
        "You've reached your storage limit. Please upgrade your plan or delete some photos.",
      code: 'LIMIT_EXCEEDED',
      limitType: 'storage',
      current: storageLimit.usedBytes,
      limit: storageLimit.limitBytes,
    };
  }

  try {
    // Generate unique filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}-${randomStr}.${ext}`;
    const storagePath = `events/${eventId}/photos/${filename}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { 
        success: false,
        error: uploadError.message || 'Failed to upload file to storage. Please check your storage configuration.',
        code: 'UPLOAD_FAILED',
      };
    }

    // Create media record with uploader_id for collaborator tracking
    const { data: media, error: dbError } = await serviceClient
      .from('media')
      .insert({
        event_id: eventId,
        uploader_id: actorPhotographerId, // Actual uploader for revenue tracking
        storage_path: storagePath,
        original_filename: file.name,
        media_type: 'photo',
        mime_type: file.type,
        file_size: file.size,
        width: null,
        height: null,
        thumbnail_path: null,
        watermarked_path: null,
        faces_detected: 0,
        faces_indexed: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
        // Clean up uploaded file if database insert fails
        try {
          await serviceClient.storage.from('media').remove([storagePath]);
        } catch (cleanupError) {
          console.error('Failed to cleanup uploaded file:', cleanupError);
        }
      return { 
        success: false,
        error: dbError.message || 'Failed to save media record to database',
        code: 'UPLOAD_FAILED',
      };
    }

    if (!media) {
      console.error('Media record not returned after insert');
      try {
        await serviceClient.storage.from('media').remove([storagePath]);
      } catch (cleanupError) {
        console.error('Failed to cleanup uploaded file:', cleanupError);
      }
      return { success: false, error: 'Failed to create media record', code: 'UPLOAD_FAILED' };
    }

    const priority = (await checkFeature(event.photographer_id, 'priority_processing')) ? 'high' : 'normal';

    if (event.face_recognition_enabled) {
      serviceClient
        .rpc('enqueue_media_processing_job', {
          p_media_id: media.id,
          p_job_type: 'face_index',
          p_priority: priority,
          p_payload: { source: 'event_upload' },
        })
        .catch((err) => {
          console.error('Failed to enqueue face-index job, falling back to direct processing:', err);
          processFacesAsync(media.id, eventId).catch((fallbackErr) => {
            console.error('Background face processing fallback error:', fallbackErr);
          });
        });
    }

    const canUseCustomWatermark = await checkFeature(event.photographer_id, 'custom_watermark');
    if (canUseCustomWatermark) {
      serviceClient
        .rpc('enqueue_media_processing_job', {
          p_media_id: media.id,
          p_job_type: 'watermark_generate',
          p_priority: priority,
          p_payload: { source: 'event_upload' },
        })
        .catch((err) => {
          console.error('Failed to enqueue watermark job:', err);
        });
    }

    notifyEventSubscribersAboutNewPhotos(serviceClient, event as any, media.id).catch((err) => {
      console.error('Background attendee notification error:', err);
    });

    // Revalidate the event page
    revalidatePath(`/dashboard/events/${eventId}`);

    return {
      success: true,
      mediaId: media.id,
      storagePath: media.storage_path,
    };
  } catch (error: any) {
    console.error('Upload error:', error);
    const isUpstream = isSupabaseTransportOrUpstreamError(error);
    return { 
      success: false,
      error:
        isUpstream
          ? 'Connection issue. Retrying usually fixes this.'
          : error?.message || 'An unexpected error occurred during upload. Please try again.',
      code: isUpstream ? 'UPSTREAM_UNAVAILABLE' : 'UPLOAD_FAILED',
    };
  }
}

// Background face processing
async function processFacesAsync(mediaId: string, eventId: string) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.authorization = `Bearer ${session.access_token}`;
    }

    await fetch(`${baseUrl}/api/media/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mediaId, eventId }),
    });
  } catch (error) {
    console.error('Face processing request failed:', error);
  }
}

// ============================================
// PROCESS FACES (Manual trigger)
// ============================================

export async function processMediaFaces(mediaId: string, eventId: string) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  if (!user) {
    return { error: 'Not authenticated' };
  }
  const photographerIdCandidates = await getPhotographerIdCandidates(supabase, user.id, user.email);

  // Verify event ownership
  const { data: event, error: eventError } = await serviceClient
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError && !isSupabaseNotFound(eventError)) {
    console.error('Failed to verify event access for media processing:', {
      eventId,
      mediaId,
      userId: user.id,
      error: eventError,
    });
    return { error: eventError.message || 'Failed to verify event access' };
  }

  if (!event) {
    return { error: 'Event not found' };
  }

  let canProcess = photographerIdCandidates.includes(event.photographer_id);
  if (!canProcess) {
    const { data: collaborator, error: collaboratorError } = await serviceClient
      .from('event_collaborators')
      .select('can_upload')
      .eq('event_id', eventId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'active')
      .maybeSingle();

    if (collaboratorError && !isSupabaseNotFound(collaboratorError)) {
      console.error('Collaborator lookup failed for media processing:', {
        eventId,
        userId: user.id,
        error: collaboratorError,
      });
      return { error: collaboratorError.message || 'Failed to verify upload permissions' };
    }
    canProcess = collaborator?.can_upload === true;
  }

  if (!canProcess) {
    return { error: 'You do not have permission to process this event' };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${baseUrl}/api/media/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mediaId, eventId }),
    });

    const result = await response.json();
    
    revalidatePath(`/dashboard/events/${eventId}`);
    
    return result;
  } catch (error) {
    console.error('Face processing error:', error);
    return { error: 'Face processing failed' };
  }
}

// ============================================
// DELETE PHOTO
// ============================================

export async function deletePhoto(mediaId: string, eventId: string) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }
  const photographerIdCandidates = await getPhotographerIdCandidates(supabase, user.id, user.email);
  const { data: actorPhotographerProfile } = await resolvePhotographerProfileByUser(
    supabase,
    user.id,
    user.email
  );
  const actorPhotographerId = actorPhotographerProfile?.id as string | undefined;

  // Get media record first to check ownership
  const { data: media } = await serviceClient
    .from('media')
    .select('storage_path, thumbnail_path, watermarked_path, uploader_id')
    .eq('id', mediaId)
    .eq('event_id', eventId)
    .single();

  if (!media) {
    return { error: 'Photo not found' };
  }

  // Check if user can delete this photo
  // Either: event owner, or uploader with delete permission
  const { data: event, error: eventError } = await serviceClient
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError && !isSupabaseNotFound(eventError)) {
    console.error('Failed to verify event access for delete:', {
      eventId,
      mediaId,
      userId: user.id,
      error: eventError,
    });
    return { error: eventError.message || 'Failed to verify event access' };
  }

  if (!event) {
    return { error: 'Event not found' };
  }

  let canDelete = photographerIdCandidates.includes(event.photographer_id);
  
  if (!canDelete && actorPhotographerId && media.uploader_id === actorPhotographerId) {
    // Check if collaborator can delete own photos
    const { data: collaborator } = await serviceClient
      .from('event_collaborators')
      .select('can_delete_own_photos')
      .eq('event_id', eventId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'active')
      .maybeSingle();
    
    canDelete = collaborator?.can_delete_own_photos === true;
  }

  if (!canDelete) {
    return { error: 'You do not have permission to delete this photo' };
  }

  // Get face IDs to delete from Rekognition
  const { data: faceEmbeddings } = await serviceClient
    .from('face_embeddings')
    .select('rekognition_face_id')
    .eq('media_id', mediaId);

  try {
    // Delete faces from Rekognition collection
    if (faceEmbeddings && faceEmbeddings.length > 0) {
      const faceIds = faceEmbeddings.map((f) => f.rekognition_face_id);
      await deleteFaces(eventId, faceIds);
    }

    // Delete from storage
    const pathsToDelete = [media.storage_path];
    if (media.thumbnail_path) pathsToDelete.push(media.thumbnail_path);
    if (media.watermarked_path) pathsToDelete.push(media.watermarked_path);

    await serviceClient.storage.from('media').remove(pathsToDelete);

    // Delete face embeddings from database (cascade should handle this, but explicit is better)
    await serviceClient
      .from('face_embeddings')
      .delete()
      .eq('media_id', mediaId);

    // Delete media record
    const { error: deleteError } = await serviceClient
      .from('media')
      .delete()
      .eq('id', mediaId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return { error: 'Failed to delete photo' };
    }

    revalidatePath(`/dashboard/events/${eventId}`);

    return { success: true };
  } catch (error) {
    console.error('Delete error:', error);
    return { error: 'An unexpected error occurred' };
  }
}

// ============================================
// GET PHOTO URL
// ============================================

export async function getPhotoUrl(storagePath: string) {
  const supabase = await createClient();
  
  const { data } = await supabase.storage
    .from('media')
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

  if (!data?.signedUrl) {
    return { error: 'Failed to generate URL' };
  }

  return { url: data.signedUrl };
}
