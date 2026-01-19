-- Fix RLS with Explicit Type Handling
-- Migration: 037_fix_rls_with_explicit_types
-- This uses explicit UUID casting to avoid type mismatch issues

-- ============================================
-- Drop debug policies first
-- ============================================
DROP POLICY IF EXISTS "media_insert_debug_temp" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert_debug_temp" ON storage.objects;

-- ============================================
-- Drop existing policies
-- ============================================
DROP POLICY IF EXISTS "media_insert" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert" ON storage.objects;

-- ============================================
-- MEDIA bucket INSERT policy with explicit UUID casting
-- ============================================
CREATE POLICY "media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  -- Extract event ID from path and check ownership
  -- Use explicit UUID casting to avoid type mismatch
  EXISTS (
    SELECT 1 
    FROM public.events e
    WHERE e.id::text = split_part(name, '/', 2)
      AND e.photographer_id::text = auth.uid()::text
      AND e.photographer_id IS NOT NULL
  )
);

-- ============================================
-- COVERS bucket INSERT policy with explicit UUID casting
-- ============================================
CREATE POLICY "covers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  -- Extract event ID from first segment of path
  -- Path format: {eventId}/cover.{ext}
  EXISTS (
    SELECT 1 
    FROM public.events e
    WHERE e.id::text = split_part(name, '/', 1)
      AND e.photographer_id::text = auth.uid()::text
      AND e.photographer_id IS NOT NULL
  )
);

-- ============================================
-- Test query to verify policy logic
-- Replace 'YOUR_EVENT_ID' and 'YOUR_USER_ID' with actual values
-- ============================================
/*
-- Test if event ownership check works:
SELECT 
  e.id::text as event_id_text,
  e.photographer_id::text as photographer_id_text,
  split_part('events/YOUR_EVENT_ID/photos/test.jpg', '/', 2) as extracted_event_id,
  (e.id::text = split_part('events/YOUR_EVENT_ID/photos/test.jpg', '/', 2)) as id_matches,
  (e.photographer_id::text = 'YOUR_USER_ID'::text) as owner_matches
FROM public.events e
WHERE e.id = 'YOUR_EVENT_ID'::uuid;
*/
