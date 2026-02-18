-- Ensure follow-privacy controls exist consistently across profile/privacy tables.

ALTER TABLE user_privacy_settings
  ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE attendees
  ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE;

-- Keep existing rows deterministic for API defaults.
UPDATE user_privacy_settings
SET allow_follows = COALESCE(allow_follows, TRUE);

UPDATE attendees
SET allow_follows = COALESCE(allow_follows, TRUE);

UPDATE photographers
SET allow_follows = COALESCE(allow_follows, TRUE);
