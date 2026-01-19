-- Comprehensive Storage RLS Policy Fix
-- Migration: 030_fix_storage_rls_comprehensive
-- This fixes RLS policy violations for media and covers buckets

-- ============================================
-- Drop ALL existing policies for media and covers
-- ============================================
DO $$
BEGIN
  -- Drop media bucket policies
  DROP POLICY IF EXISTS "Photographers can upload to events" ON storage.objects;
  DROP POLICY IF EXISTS "Photographers can read their media" ON storage.objects;
  DROP POLICY IF EXISTS "Photographers can delete their media" ON storage.objects;
  DROP POLICY IF EXISTS "Attendees can read event media" ON storage.objects;
  DROP POLICY IF EXISTS "Public can read event media" ON storage.objects;
  
  -- Drop covers bucket policies
  DROP POLICY IF EXISTS "Photographers can upload covers" ON storage.objects;
  DROP POLICY IF EXISTS "Photographers can read covers" ON storage.objects;
  DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can read covers" ON storage.objects;
  DROP POLICY IF EXISTS "Photographers can delete covers" ON storage.objects;
END $$;

-- ============================================
-- Ensure buckets exist
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true, -- Public bucket
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ============================================
-- MEDIA BUCKET POLICIES
-- ============================================
-- Path format: events/{eventId}/photos/{filename}

-- Policy: Photographers can upload to their events (media bucket)
-- Path format: events/{eventId}/photos/{filename}
CREATE POLICY "Photographers can upload to events"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = split_part(name, '/', 2)
    AND events.photographer_id = auth.uid()
  )
);

-- Policy: Photographers can read their event media
CREATE POLICY "Photographers can read their media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media' AND
  (
    -- Photographers can read their own event media
    (
      (storage.foldername(name))[1] = 'events' AND
      EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id::text = (storage.foldername(name))[2]
        AND events.photographer_id = auth.uid()
      )
    )
    OR
    -- Attendees can read media from events they have access to (have entitlements)
    (
      (storage.foldername(name))[1] = 'events' AND
      EXISTS (
        SELECT 1 FROM public.events e
        JOIN public.entitlements ent ON ent.event_id = e.id
        WHERE e.id::text = (storage.foldername(name))[2]
        AND ent.attendee_id = auth.uid()
      )
    )
    OR
    -- Public events are readable by authenticated users
    (
      (storage.foldername(name))[1] = 'events' AND
      EXISTS (
        SELECT 1 FROM public.events
        WHERE events.id::text = (storage.foldername(name))[2]
        AND events.is_public = true
        AND events.status = 'active'
      )
    )
  )
);

-- Policy: Photographers can delete their event media
-- Path format: events/{eventId}/photos/{filename}
CREATE POLICY "Photographers can delete their media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  name LIKE 'events/%' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = split_part(name, '/', 2)
    AND events.photographer_id = auth.uid()
  )
);

-- ============================================
-- COVERS BUCKET POLICIES
-- ============================================
-- Path format: {eventId}/cover.{ext}

-- Policy: Photographers can upload cover images to their events
CREATE POLICY "Photographers can upload covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = (storage.foldername(name))[1]
    AND events.photographer_id = auth.uid()
  )
);

-- Policy: Anyone can read cover images (public bucket)
CREATE POLICY "Anyone can read covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'covers');

-- Policy: Photographers can delete their cover images
-- Path format: {eventId}/cover.{ext}
CREATE POLICY "Photographers can delete covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = split_part(name, '/', 1)
    AND events.photographer_id = auth.uid()
  )
);

-- ============================================
-- Note: Supabase automatically handles grants for storage
-- No manual grants needed
-- ============================================
