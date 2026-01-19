-- Verify and Fix Storage RLS Policies
-- Migration: 031_verify_storage_rls
-- Run this if uploads are still failing after migration 030

-- ============================================
-- Check current policies
-- ============================================
-- This will show all existing policies (for debugging)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies 
-- WHERE tablename = 'objects' AND policyname LIKE '%media%' OR policyname LIKE '%cover%';

-- ============================================
-- Note: RLS is already enabled on storage.objects by Supabase
-- We cannot alter system tables directly
-- ============================================

-- ============================================
-- Drop and recreate media upload policy with simpler check
-- ============================================
DROP POLICY IF EXISTS "Photographers can upload to events" ON storage.objects;

CREATE POLICY "Photographers can upload to events"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = split_part(name, '/', 2)
    AND events.photographer_id = auth.uid()
  )
);

-- ============================================
-- Verify covers upload policy
-- ============================================
DROP POLICY IF EXISTS "Photographers can upload covers" ON storage.objects;

CREATE POLICY "Photographers can upload covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = split_part(name, '/', 1)
    AND events.photographer_id = auth.uid()
  )
);
