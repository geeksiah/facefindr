-- Final Storage RLS Fix
-- Migration: 032_storage_rls_final_fix
-- This is a comprehensive, clean migration for storage RLS policies

-- ============================================
-- STEP 1: Drop ALL existing storage policies
-- We need to drop all policies first to avoid conflicts
-- ============================================

-- Drop all media-related policies
DROP POLICY IF EXISTS "Photographers can upload to events" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read their media" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete their media" ON storage.objects;
DROP POLICY IF EXISTS "Attendees can read event media" ON storage.objects;
DROP POLICY IF EXISTS "Attendees can read media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read event media" ON storage.objects;
DROP POLICY IF EXISTS "Users can read media from public events" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read public event media" ON storage.objects;

-- Drop all cover-related policies
DROP POLICY IF EXISTS "Photographers can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete covers" ON storage.objects;
DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read covers" ON storage.objects;

-- Drop avatar-related policies (if any custom ones exist)
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read avatars" ON storage.objects;

-- ============================================
-- STEP 2: Ensure buckets exist with correct settings
-- ============================================

-- Media bucket (private - for event photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

-- Covers bucket (public - for event cover images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Avatars bucket (public - for user profile photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ============================================
-- STEP 3: Create MEDIA bucket policies
-- Storage path: events/{eventId}/photos/{filename}
-- ============================================

-- INSERT: Photographers can upload to their events
CREATE POLICY "media_insert_photographers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  -- Path must start with 'events/'
  (storage.foldername(name))[1] = 'events' AND
  -- Second folder must be an event ID owned by the user
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[2]
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Photographers can read their event media
CREATE POLICY "media_select_photographers"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[2]
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Attendees can read media from events they have entitlements to
CREATE POLICY "media_select_attendees"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = 'events' AND
  EXISTS (
    SELECT 1 FROM public.entitlements ent
    WHERE ent.event_id::text = (storage.foldername(name))[2]
    AND ent.attendee_id = auth.uid()
  )
);

-- SELECT: Anyone can read media from public events
CREATE POLICY "media_select_public"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[2]
    AND e.is_public = true
    AND e.status = 'active'
  )
);

-- DELETE: Photographers can delete their event media
CREATE POLICY "media_delete_photographers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[2]
    AND e.photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 4: Create COVERS bucket policies
-- Storage path: {eventId}/cover.{ext}
-- ============================================

-- INSERT: Photographers can upload covers for their events
CREATE POLICY "covers_insert_photographers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[1]
    AND e.photographer_id = auth.uid()
  )
);

-- SELECT: Anyone can read covers (public bucket)
CREATE POLICY "covers_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'covers');

-- DELETE: Photographers can delete covers for their events
CREATE POLICY "covers_delete_photographers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[1]
    AND e.photographer_id = auth.uid()
  )
);

-- ============================================
-- STEP 5: Create AVATARS bucket policies
-- Storage path: {userId}.{ext} or {userId}/{filename}
-- ============================================

-- INSERT: Users can upload their own avatars
CREATE POLICY "avatars_insert_users"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (
    -- Direct path: {userId}.{ext}
    auth.uid()::text = split_part(name, '.', 1)
    OR
    -- Folder path: {userId}/{filename}
    auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- SELECT: Anyone can read avatars (public bucket)
CREATE POLICY "avatars_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- DELETE: Users can delete their own avatars
CREATE POLICY "avatars_delete_users"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (
    auth.uid()::text = split_part(name, '.', 1)
    OR
    auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- ============================================
-- VERIFICATION QUERY (run manually to verify)
-- ============================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'objects' 
-- ORDER BY policyname;
