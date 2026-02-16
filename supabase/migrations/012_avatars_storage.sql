-- Ferchr Database Migration
-- Migration: 012_avatars_storage
-- Description: Storage bucket for profile photos

-- ============================================
-- CREATE AVATARS BUCKET
-- ============================================

-- Create the avatars bucket (run in Storage section or via API)
-- Note: Bucket creation via SQL is not directly supported,
-- so this is just for documentation. Create bucket in Supabase Dashboard.

-- If using Supabase Dashboard:
-- 1. Go to Storage
-- 2. Create new bucket named "avatars"
-- 3. Set to Public

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to view avatars (they're public profile photos)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow users to update their own avatars
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- EXTEND PHOTOGRAPHERS TABLE (if not exists)
-- ============================================

-- Add social and profile fields if they don't exist
DO $$
BEGIN
  -- Add business_name if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'business_name') THEN
    ALTER TABLE photographers ADD COLUMN business_name VARCHAR(255);
  END IF;

  -- Add bio if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'bio') THEN
    ALTER TABLE photographers ADD COLUMN bio TEXT;
  END IF;

  -- Add website if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'website') THEN
    ALTER TABLE photographers ADD COLUMN website VARCHAR(500);
  END IF;

  -- Add instagram if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'instagram') THEN
    ALTER TABLE photographers ADD COLUMN instagram VARCHAR(100);
  END IF;

  -- Add twitter if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'twitter') THEN
    ALTER TABLE photographers ADD COLUMN twitter VARCHAR(100);
  END IF;

  -- Add facebook if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'facebook') THEN
    ALTER TABLE photographers ADD COLUMN facebook VARCHAR(500);
  END IF;

  -- Add phone if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'phone') THEN
    ALTER TABLE photographers ADD COLUMN phone VARCHAR(30);
  END IF;

  -- Add location if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'location') THEN
    ALTER TABLE photographers ADD COLUMN location VARCHAR(255);
  END IF;

  -- Add timezone if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'timezone') THEN
    ALTER TABLE photographers ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
  END IF;

  -- Add stripe_customer_id if not exists (for subscriptions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'photographers' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE photographers ADD COLUMN stripe_customer_id VARCHAR(255);
  END IF;
END $$;

-- Create index on stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_photographers_stripe_customer 
ON photographers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
