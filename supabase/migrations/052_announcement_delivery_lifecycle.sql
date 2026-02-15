-- Announcement delivery lifecycle and outcome tracking

DO $$ BEGIN
  ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'queued';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'sending';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'delivered';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'partially_delivered';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE platform_announcements
  ADD COLUMN IF NOT EXISTS queued_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_completed_at TIMESTAMPTZ;

UPDATE platform_announcements
SET
  delivered_count = COALESCE(sent_count, 0),
  queued_count = 0,
  failed_count = 0,
  delivery_summary = jsonb_build_object(
    'total', COALESCE(sent_count, 0),
    'pending', 0,
    'successful', COALESCE(sent_count, 0),
    'failed', 0,
    'seeded_from_sent_count', TRUE,
    'updated_at', NOW()
  ),
  delivery_synced_at = COALESCE(delivery_synced_at, NOW()),
  delivery_completed_at = COALESCE(delivery_completed_at, sent_at)
WHERE status = 'sent'
  AND COALESCE(sent_count, 0) > 0
  AND delivered_count = 0
  AND failed_count = 0;
