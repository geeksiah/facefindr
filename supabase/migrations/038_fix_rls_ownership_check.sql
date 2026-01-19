-- Fix RLS Ownership Check
-- Migration: 038_fix_rls_ownership_check
-- Since debug policy worked, the issue is the ownership check logic

-- Drop debug policies
DROP POLICY IF EXISTS "media_insert_debug_temp" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert_debug_temp" ON storage.objects;

-- Drop existing policies
DROP POLICY IF EXISTS "media_insert" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert" ON storage.objects;

-- ============================================
-- MEDIA bucket INSERT policy
-- The issue: We need to ensure the event exists AND user owns it
-- Using a more explicit check
-- ============================================
CREATE POLICY "media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  -- Check that path has at least 3 segments (events/eventId/photos/filename)
  array_length(string_to_array(name, '/'), 1) >= 3 AND
  -- Extract event ID and verify ownership
  EXISTS (
    SELECT 1 
    FROM public.events e
    WHERE e.id::text = (string_to_array(name, '/'))[2]
      AND e.photographer_id = auth.uid()
  )
);

-- ============================================
-- COVERS bucket INSERT policy
-- ============================================
CREATE POLICY "covers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  -- Path format: {eventId}/cover.{ext}
  -- Extract event ID from first segment
  EXISTS (
    SELECT 1 
    FROM public.events e
    WHERE e.id::text = (string_to_array(name, '/'))[1]
      AND e.photographer_id = auth.uid()
  )
);
