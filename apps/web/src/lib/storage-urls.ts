/**
 * Storage URL Utilities for Web
 * 
 * Converts storage paths to accessible URLs
 */

import { createClient } from '@/lib/supabase/client';

/**
 * Get public URL for a storage path (for public buckets like covers, avatars)
 */
export function getPublicUrl(bucket: string, path: string): string {
  if (!path) return '';
  
  // If it's already a full URL, return it
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);
  return data.publicUrl;
}

/**
 * Get signed URL for a storage path (for private buckets like media)
 * Expires in 1 hour by default
 */
export async function getSignedUrl(bucket: string, path: string, expiresIn: number = 3600): Promise<string | null> {
  if (!path) return null;
  
  try {
    const supabase = createClient();
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(cleanPath, expiresIn);
    
    if (error || !data) {
      console.error('Error creating signed URL:', error);
      return null;
    }
    
    return data.signedUrl;
  } catch (error) {
    console.error('Error creating signed URL:', error);
    return null;
  }
}

/**
 * Get thumbnail URL for media (uses signed URL since media bucket is private)
 */
export async function getThumbnailUrl(thumbnailPath: string | null, storagePath: string | null): Promise<string | null> {
  const path = thumbnailPath || storagePath;
  if (!path) return null;
  
  // Clean path (remove leading slash if present)
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return getSignedUrl('media', cleanPath);
}

/**
 * Get cover image URL (uses public URL since covers bucket is public)
 */
export function getCoverImageUrl(coverImagePath: string | null): string | null {
  if (!coverImagePath) return null;
  
  // If it's already a full URL, return it
  if (coverImagePath.startsWith('http://') || coverImagePath.startsWith('https://')) {
    return coverImagePath;
  }
  
  // Try covers bucket first, then events bucket
  return getPublicUrl('covers', coverImagePath) || getPublicUrl('events', coverImagePath);
}
