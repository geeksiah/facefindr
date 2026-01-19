-- Simple Storage RLS Fix (Alternative)
-- Migration: 033_storage_rls_simple
-- Use this if 032 doesn't work - uses split_part instead of storage.foldername

-- ============================================
-- STEP 1: Drop ALL existing storage policies
-- ============================================

-- Drop all policies for clean slate
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

-- Drop new policy names from 032 if they exist
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

-- Drop new policy names from this migration (033) if they exist
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
-- STEP 3: MEDIA bucket policies (using split_part)
-- Path: events/{eventId}/photos/{filename}
-- split_part(name, '/', 1) = 'events'
-- split_part(name, '/', 2) = eventId
-- ============================================

-- Photographers can upload to their events
CREATE POLICY "media_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 2)
    AND photographer_id = auth.uid()
  )
);

-- Photographers can read their event media
CREATE POLICY "media_read_owner"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 2)
    AND photographer_id = auth.uid()
  )
);

-- Attendees can read media from events with entitlements
CREATE POLICY "media_read_entitled"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.entitlements
    WHERE event_id::text = split_part(name, '/', 2)
    AND attendee_id = auth.uid()
  )
);

-- Anyone can read media from public events
CREATE POLICY "media_read_public"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 2)
    AND is_public = true
    AND status = 'active'
  )
);

-- Photographers can delete their event media
CREATE POLICY "media_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  split_part(name, '/', 1) = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 2)
    AND photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 4: COVERS bucket policies
-- Path: {eventId}/cover.{ext}
-- split_part(name, '/', 1) = eventId
-- ============================================

-- Photographers can upload covers
CREATE POLICY "covers_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 1)
    AND photographer_id = auth.uid()
  )
);

-- Anyone can read covers
CREATE POLICY "covers_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'covers');

-- Photographers can delete covers
CREATE POLICY "covers_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE id::text = split_part(name, '/', 1)
    AND photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 5: AVATARS bucket policies
-- Path: {userId}/{filename} or {userId}.{ext}
-- ============================================

-- Users can upload their avatars
CREATE POLICY "avatars_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    split_part(name, '/', 1) = auth.uid()::text OR
    split_part(name, '.', 1) = auth.uid()::text
  )
);

-- Anyone can read avatars
CREATE POLICY "avatars_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Users can delete their avatars
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
