'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { deleteFaces } from '@/lib/aws/rekognition';

// ============================================
// UPLOAD PHOTOS
// ============================================

export async function uploadPhotos(formData: FormData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const file = formData.get('file') as File;
  const eventId = formData.get('eventId') as string;

  if (!file || !eventId) {
    return { error: 'Missing file or event ID' };
  }

  // Verify event ownership
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id, face_recognition_enabled')
    .eq('id', eventId)
    .single();

  if (!event || event.photographer_id !== user.id) {
    return { error: 'Event not found' };
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

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { error: 'Failed to upload file to storage' };
    }

    // Create media record
    const { data: media, error: dbError } = await supabase
      .from('media')
      .insert({
        event_id: eventId,
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
      await supabase.storage.from('media').remove([storagePath]);
      return { error: 'Failed to save media record' };
    }

    // Trigger face processing in background (non-blocking)
    if (event.face_recognition_enabled) {
      // We'll call the API route to process faces
      // This happens async so upload doesn't wait
      processFacesAsync(media.id, eventId).catch((err) => {
        console.error('Background face processing error:', err);
      });
    }

    // Revalidate the event page
    revalidatePath(`/dashboard/events/${eventId}`);

    return {
      success: true,
      mediaId: media.id,
      storagePath: media.storage_path,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { error: 'An unexpected error occurred during upload' };
  }
}

// Background face processing
async function processFacesAsync(mediaId: string, eventId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    await fetch(`${baseUrl}/api/media/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify event ownership
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!event || event.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/media/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify event ownership
  const { data: event } = await supabase
    .from('events')
    .select('photographer_id')
    .eq('id', eventId)
    .single();

  if (!event || event.photographer_id !== user.id) {
    return { error: 'Event not found' };
  }

  // Get media record with face embeddings
  const { data: media } = await supabase
    .from('media')
    .select('storage_path, thumbnail_path, watermarked_path')
    .eq('id', mediaId)
    .eq('event_id', eventId)
    .single();

  if (!media) {
    return { error: 'Photo not found' };
  }

  // Get face IDs to delete from Rekognition
  const { data: faceEmbeddings } = await supabase
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

    await supabase.storage.from('media').remove(pathsToDelete);

    // Delete face embeddings from database (cascade should handle this, but explicit is better)
    await supabase
      .from('face_embeddings')
      .delete()
      .eq('media_id', mediaId);

    // Delete media record
    const { error: deleteError } = await supabase
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
  const supabase = createClient();
  
  const { data } = await supabase.storage
    .from('media')
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

  if (!data?.signedUrl) {
    return { error: 'Failed to generate URL' };
  }

  return { url: data.signedUrl };
}
