-- Fix Storage RLS Policies for Media and Covers Buckets
-- This migration fixes the "new row violates row-level security policy" errors

-- ============================================
-- Create covers bucket if it doesn't exist
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'covers',
  'covers',
  true, -- Public bucket for cover images
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Drop existing policies if they exist (to recreate them)
-- ============================================
DROP POLICY IF EXISTS "Photographers can upload to events" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read their media" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete their media" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;
DROP POLICY IF EXISTS "Photographers can delete covers" ON storage.objects;

-- ============================================
-- Media Bucket Policies
-- ============================================

-- Policy: Photographers can upload to their events (media bucket)
CREATE POLICY "Photographers can upload to events"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  (storage.foldername(name))[1] = 'events' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = (storage.foldername(name))[2]
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
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id::text = (storage.foldername(name))[2]
      AND events.photographer_id = auth.uid()
    )
    OR
    -- Attendees can read media from events they have access to
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.entitlements ent ON ent.event_id = e.id
      WHERE e.id::text = (storage.foldername(name))[2]
      AND ent.attendee_id = auth.uid()
      AND ent.status = 'active'
    )
    OR
    -- Public events are readable by anyone
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id::text = (storage.foldername(name))[2]
      AND events.is_public = true
      AND events.status = 'active'
    )
  )
);

-- Policy: Photographers can delete their event media
CREATE POLICY "Photographers can delete their media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = (storage.foldername(name))[2]
    AND events.photographer_id = auth.uid()
  )
);

-- ============================================
-- Covers Bucket Policies
-- ============================================

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
CREATE POLICY "Photographers can read covers"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'covers'
);

-- Policy: Public can read cover images (for public events)
CREATE POLICY "Public can read covers"
ON storage.objects FOR SELECT
TO anon
USING (
  bucket_id = 'covers'
);

-- Policy: Photographers can delete their cover images
CREATE POLICY "Photographers can delete covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'covers' AND
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = (storage.foldername(name))[1]
    AND events.photographer_id = auth.uid()
  )
);

-- ============================================
-- Update existing media bucket (if needed)
-- ============================================
-- Ensure media bucket exists
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
