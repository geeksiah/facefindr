'use server';

import { revalidatePath } from 'next/cache';

import { deleteFaces } from '@/lib/aws/rekognition';
import { getPhotographerIdCandidates, resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { checkLimit } from '@/lib/subscription/enforcement';
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

async function notifyEventSubscribersAboutNewPhotos(
  serviceClient: any,
  event: { id: string; name?: string | null; public_slug?: string | null; status?: string | null },
  mediaId: string
) {
  if (!event?.id || event.status !== 'active') return;

  const { data: consentRows, error: consentError } = await serviceClient
    .from('attendee_consents')
    .select('attendee_id')
    .eq('event_id', event.id)
    .eq('consent_type', 'biometric')
    .is('withdrawn_at', null);

  if (consentError) {
    console.error('Subscriber lookup failed:', consentError);
    return;
  }

  const attendeeIds = Array.from(
    new Set((consentRows || []).map((row: any) => row.attendee_id).filter(Boolean))
  ) as string[];

  if (!attendeeIds.length) return;

  // Deduplicate per event per hour to prevent notification storms during batch uploads.
  const hourBucket = new Date().toISOString().slice(0, 13);
  const dedupeKey = `event_new_photos:${event.id}:${hourBucket}`;

  const { data: existingNotification } = await serviceClient
    .from('notifications')
    .select('id')
    .eq('template_code', 'event_new_photos')
    .eq('channel', 'in_app')
    .eq('metadata->>dedupeKey', dedupeKey)
    .limit(1)
    .maybeSingle();

  if (existingNotification?.id) return;

  const now = new Date().toISOString();
  const eventName = event.name || 'Your event';
  const eventPath = event.public_slug ? `/e/${event.public_slug}` : `/e/${event.id}`;

  const payload = attendeeIds.map((attendeeId) => ({
    user_id: attendeeId,
    template_code: 'event_new_photos',
    channel: 'in_app',
    subject: `${eventName}: new photos added`,
    body: `New photos were posted for ${eventName}.`,
    status: 'delivered',
    sent_at: now,
    delivered_at: now,
    metadata: {
      type: 'event_new_photos',
      dedupeKey,
      eventId: event.id,
      eventName,
      eventPath,
      mediaId,
    },
  }));

  const { error: notificationError } = await serviceClient.from('notifications').insert(payload);
  if (notificationError) {
    console.error('Failed to create attendee notifications:', notificationError);
  }
}

// ============================================
// UPLOAD PHOTOS
// ============================================

export async function uploadPhotos(formData: FormData) {
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
  if (!actorPhotographerProfile?.id) {
    return { error: 'Creator profile not found' };
  }
  const actorPhotographerId = actorPhotographerProfile.id as string;

  const file = formData.get('file') as File;
  const eventId = formData.get('eventId') as string;

  if (!file || !eventId) {
    return { error: 'Missing file or event ID' };
  }

  // Verify event access - either owner or collaborator with upload permission
  const { data: event } = await supabase
    .from('events')
    .select('id, name, public_slug, status, photographer_id, face_recognition_enabled')
    .eq('id', eventId)
    .single();

  if (!event) {
    return { error: 'Event not found' };
  }

  // Check if user is owner or collaborator with upload permission
  let canUpload = photographerIdCandidates.includes(event.photographer_id);
  const photographerId = event.photographer_id; // Use event owner for limit checks
  
  if (!canUpload) {
    // Check collaborator permissions
    const { data: collaborator } = await supabase
      .from('event_collaborators')
      .select('can_upload')
      .eq('event_id', eventId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'active')
      .single();
    
    canUpload = collaborator?.can_upload === true;
  }

  if (!canUpload) {
    return { error: 'You do not have permission to upload to this event' };
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { error: 'Invalid file type. Only JPEG, PNG, HEIC, and WebP are allowed.' };
  }

  // Validate file size (50MB max)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { error: 'File too large. Maximum size is 50MB.' };
  }

  // ENFORCE: Check photo limit using the enforcement system
  const photoLimit = await checkLimit(photographerId, 'photos', eventId);
  if (!photoLimit.allowed) {
    return {
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
        error: uploadError.message || 'Failed to upload file to storage. Please check your storage configuration.' 
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
        error: dbError.message || 'Failed to save media record to database' 
      };
    }

    if (!media) {
      console.error('Media record not returned after insert');
      try {
        await serviceClient.storage.from('media').remove([storagePath]);
      } catch (cleanupError) {
        console.error('Failed to cleanup uploaded file:', cleanupError);
      }
      return { error: 'Failed to create media record' };
    }

    // Trigger face processing in background (non-blocking)
    if (event.face_recognition_enabled) {
      // We'll call the API route to process faces
      // This happens async so upload doesn't wait
      processFacesAsync(media.id, eventId).catch((err) => {
        console.error('Background face processing error:', err);
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
    return { 
      error: error?.message || 'An unexpected error occurred during upload. Please try again.' 
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
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  if (!user) {
    return { error: 'Not authenticated' };
  }
  const photographerIdCandidates = await getPhotographerIdCandidates(supabase, user.id, user.email);

  // Verify event ownership
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!event || !photographerIdCandidates.includes(event.photographer_id)) {
    return { error: 'Event not found' };
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
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!event) {
    return { error: 'Event not found' };
  }

  let canDelete = photographerIdCandidates.includes(event.photographer_id);
  
  if (!canDelete && actorPhotographerId && media.uploader_id === actorPhotographerId) {
    // Check if collaborator can delete own photos
    const { data: collaborator } = await supabase
      .from('event_collaborators')
      .select('can_delete_own_photos')
      .eq('event_id', eventId)
      .in('photographer_id', photographerIdCandidates)
      .eq('status', 'active')
      .single();
    
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
