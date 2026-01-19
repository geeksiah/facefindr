-- Debug Storage Upload Issues
-- Run this AFTER migration 034 to debug upload failures
-- Replace 'YOUR_EVENT_ID' with an actual event ID from your events table

-- ============================================
-- STEP 1: Check if policies exist
-- ============================================
SELECT 
  policyname, 
  cmd, 
  permissive, 
  roles,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
ORDER BY policyname;

-- ============================================
-- STEP 2: Test event ownership check
-- Replace 'YOUR_EVENT_ID' with actual event ID
-- ============================================
-- First, get an event ID:
SELECT id, name, photographer_id, status 
FROM public.events 
ORDER BY created_at DESC 
LIMIT 5;

-- Then test ownership (replace EVENT_ID_HERE):
-- SELECT 
--   e.id as event_id,
--   e.photographer_id,
--   auth.uid() as current_user_id,
--   (e.photographer_id = auth.uid()) as is_owner
-- FROM public.events e
-- WHERE e.id = 'EVENT_ID_HERE';

-- ============================================
-- STEP 3: Test path parsing
-- ============================================
SELECT 
  'events/abc123/photos/image.jpg' as test_path,
  split_part('events/abc123/photos/image.jpg', '/', 1) as segment_1,
  split_part('events/abc123/photos/image.jpg', '/', 2) as segment_2_event_id,
  split_part('events/abc123/photos/image.jpg', '/', 3) as segment_3;

-- ============================================
-- STEP 4: Check bucket configuration
-- ============================================
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('media', 'covers', 'avatars');

-- ============================================
-- STEP 5: Temporary permissive policy for testing
-- WARNING: Only use for debugging! Remove after fixing.
-- ============================================
-- Uncomment below to create a temporary permissive policy:
/*
CREATE POLICY "media_insert_debug"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%'
);

-- After testing, drop it:
-- DROP POLICY IF EXISTS "media_insert_debug" ON storage.objects;
*/
