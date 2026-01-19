-- Storage RLS Debug Fix
-- Migration: 034_storage_rls_debug_fix
-- This adds more permissive policies and better error handling

-- ============================================
-- STEP 1: Drop ALL existing policies
-- ============================================

-- Drop all old policy names
DROP POLICY IF EXISTS "Photographers can upload to events" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read their media" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete their media" ON storage.objects;
DROP POLICY IF EXISTS "Attendees can read event media" ON storage.objects;
DROP POLICY IF EXISTS "Attendees can read media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read event media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read media from public events" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read public event media" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;

-- Drop policy names from 032
DROP POLICY IF EXISTS "media_insert_photographers" ON storage.objects;
DROP POLICY IF EXISTS "media_select_photographers" ON storage.objects;
DROP POLICY IF EXISTS "media_select_attendees" ON storage.objects;
DROP POLICY IF EXISTS "media_select_public" ON storage.objects;
DROP POLICY IF EXISTS "media_delete_photographers" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert_photographers" ON storage.objects;
DROP POLICY IF EXISTS "covers_select_public" ON storage.objects;
DROP POLICY IF EXISTS "covers_delete_photographers" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_users" ON storage.objects;
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_users" ON storage.objects;

-- Drop policy names from 033
DROP POLICY IF EXISTS "media_upload" ON storage.objects;
DROP POLICY IF EXISTS "media_read_owner" ON storage.objects;
DROP POLICY IF EXISTS "media_read_entitled" ON storage.objects;
DROP POLICY IF EXISTS "media_read_public" ON storage.objects;
DROP POLICY IF EXISTS "media_delete" ON storage.objects;
DROP POLICY IF EXISTS "covers_upload" ON storage.objects;
DROP POLICY IF EXISTS "covers_read" ON storage.objects;
DROP POLICY IF EXISTS "covers_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

-- ============================================
-- STEP 2: Ensure buckets exist
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('covers', 'covers', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================
-- STEP 3: MEDIA bucket policies
-- Path format: events/{eventId}/photos/{filename}
-- ============================================

-- INSERT: Photographers can upload to their events
-- More permissive: Check path format first, then ownership
CREATE POLICY "media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  -- Path must start with 'events/'
  name LIKE 'events/%' AND
  -- Extract eventId from path (second segment)
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 2)
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Photographers can read their event media
CREATE POLICY "media_select_owner"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 2)
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Attendees can read media from events with entitlements
CREATE POLICY "media_select_entitled"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.entitlements ent
    JOIN public.events e ON e.id = ent.event_id
    WHERE e.id::text = split_part(name, '/', 2)
    AND ent.attendee_id = auth.uid()
  )
);

-- SELECT: Anyone can read media from public events
CREATE POLICY "media_select_public"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 2)
    AND e.is_public = true
    AND e.status = 'active'
  )
);

-- DELETE: Photographers can delete their event media
CREATE POLICY "media_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 2)
    AND e.photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 4: COVERS bucket policies
-- Path format: {eventId}/cover.{ext}
-- ============================================

-- INSERT: Photographers can upload covers
CREATE POLICY "covers_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  -- Path format: {eventId}/cover.{ext}
  -- Extract eventId from first segment
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 1)
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Anyone can read covers (public bucket)
CREATE POLICY "covers_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'covers');

-- DELETE: Photographers can delete covers
CREATE POLICY "covers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = split_part(name, '/', 1)
    AND e.photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 5: AVATARS bucket policies
-- Path format: {userId}/{filename} or {userId}.{ext}
-- ============================================

-- INSERT: Users can upload their avatars
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    split_part(name, '/', 1) = auth.uid()::text OR
    split_part(name, '.', 1) = auth.uid()::text
  )
);

-- SELECT: Anyone can read avatars (public bucket)
CREATE POLICY "avatars_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- DELETE: Users can delete their avatars
CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    split_part(name, '/', 1) = auth.uid()::text OR
    split_part(name, '.', 1) = auth.uid()::text
  )
);

-- ============================================
-- TEMPORARY DEBUG POLICY (Remove after testing!)
-- This allows any authenticated user to upload to media bucket
-- with the correct path format. Use ONLY for debugging.
-- ============================================
-- Uncomment the lines below to enable temporary permissive policy:

/*
CREATE POLICY "media_insert_debug_temp"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%'
);

-- After confirming uploads work, drop this policy:
-- DROP POLICY IF EXISTS "media_insert_debug_temp" ON storage.objects;
*/

-- ============================================
-- DEBUGGING QUERIES (run these to verify)
-- ============================================
-- Check if policies exist:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'objects' 
-- ORDER BY policyname;

-- Check if event exists and user owns it:
-- SELECT e.id, e.photographer_id, auth.uid() as current_user_id
-- FROM public.events e
-- WHERE e.id = 'YOUR_EVENT_ID_HERE';

-- Test path parsing:
-- SELECT split_part('events/abc123/photos/image.jpg', '/', 2) as event_id;

-- Check current authenticated user:
-- SELECT auth.uid() as current_user_id, auth.role() as current_role;
