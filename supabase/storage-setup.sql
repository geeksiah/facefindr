-- Ferchr Storage Setup
-- Run this in Supabase SQL Editor

-- Create the media storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Photographers can upload to their events
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
  EXISTS (
    SELECT 1 FROM public.events
    WHERE events.id::text = (storage.foldername(name))[2]
    AND events.photographer_id = auth.uid()
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
