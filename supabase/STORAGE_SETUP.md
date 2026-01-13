# Supabase Storage Setup

## Quick Setup via Dashboard (Recommended)

### Step 1: Create the Media Bucket

1. Go to **Supabase Dashboard** → **Storage** (in the sidebar)
2. Click **"New bucket"**
3. Configure:
   - **Name**: `media`
   - **Public bucket**: ❌ OFF (keep it private)
   - **File size limit**: `50` MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/heic, image/webp`
4. Click **"Create bucket"**

### Step 2: Set Up Access Policies

Go to **Storage** → **Policies** tab → Click **"New policy"** for the `media` bucket:

#### Policy 1: Photographers Upload
- **Policy name**: `Photographers can upload to events`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition** (use custom):
```sql
bucket_id = 'media' AND
(storage.foldername(name))[1] = 'events' AND
EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id::text = (storage.foldername(name))[2]
  AND events.photographer_id = auth.uid()
)
```

#### Policy 2: Photographers Read
- **Policy name**: `Photographers can read their media`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'media' AND
EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id::text = (storage.foldername(name))[2]
  AND events.photographer_id = auth.uid()
)
```

#### Policy 3: Photographers Delete
- **Policy name**: `Photographers can delete their media`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
bucket_id = 'media' AND
EXISTS (
  SELECT 1 FROM public.events
  WHERE events.id::text = (storage.foldername(name))[2]
  AND events.photographer_id = auth.uid()
)
```

---

## Alternative: SQL Setup

Run this in **SQL Editor** if you prefer:

```sql
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
```

---

## Storage Path Structure

```
media/
└── events/
    └── {event_id}/
        └── photos/
            ├── {timestamp}-{random}.jpg
            ├── {timestamp}-{random}.png
            └── ...
```

---

## Verification

After setup, verify the bucket exists:

1. Go to **Storage** in the Supabase dashboard
2. You should see the `media` bucket listed
3. Click on it - it should be empty initially

---

## Troubleshooting

### "Bucket not found" error
- Make sure the bucket name is exactly `media` (lowercase)
- Check that the bucket was created successfully in the Storage tab

### "Permission denied" error
- Verify the RLS policies are created correctly
- Check that the user is authenticated
- Ensure the event belongs to the logged-in photographer

### "File type not allowed" error
- Only JPEG, PNG, HEIC, and WebP are allowed
- Check the file's actual MIME type (not just extension)
