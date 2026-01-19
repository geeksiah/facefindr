/**
 * Storage URL Utilities
 * 
 * Converts storage paths to accessible URLs
 */

import { supabase } from './supabase';

/**
 * Get public URL for a storage path (for public buckets like covers, avatars)
 */
export function getPublicUrl(bucket: string, path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
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
  return getSignedUrl('media', path);
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
  
  return getPublicUrl('covers', coverImagePath);
}
