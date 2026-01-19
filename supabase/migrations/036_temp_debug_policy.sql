-- Temporary Debug Policy
-- This will help us identify if it's a path issue or ownership issue
-- REMOVE THIS AFTER DEBUGGING!

-- Drop existing debug policy if it exists
DROP POLICY IF EXISTS "media_insert_debug_temp" ON storage.objects;
DROP POLICY IF EXISTS "covers_insert_debug_temp" ON storage.objects;

-- Create very permissive policies for testing
-- This allows ANY authenticated user to upload to media/covers with correct path format
-- If this works, the issue is with the ownership check
-- If this fails, the issue is with path format or auth context

CREATE POLICY "media_insert_debug_temp"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media' AND
  name LIKE 'events/%'
);

CREATE POLICY "covers_insert_debug_temp"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'covers'
);

-- After testing:
-- 1. If uploads work with these policies, the issue is the ownership check
-- 2. If uploads still fail, the issue is auth context or path format
-- 3. Once identified, drop these policies:
--    DROP POLICY IF EXISTS "media_insert_debug_temp" ON storage.objects;
--    DROP POLICY IF EXISTS "covers_insert_debug_temp" ON storage.objects;
