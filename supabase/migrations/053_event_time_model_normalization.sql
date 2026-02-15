-- Event time model normalization (timezone-aware contract)

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS event_start_at_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_end_at_utc TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_event_start_at_utc
  ON events(event_start_at_utc)
  WHERE event_start_at_utc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_event_timezone
  ON events(event_timezone);

-- Backfill timezone from photographer profile timezone when available.
UPDATE events AS e
SET event_timezone = COALESCE(NULLIF(p.timezone, ''), 'UTC')
FROM photographers AS p
WHERE e.photographer_id = p.id
  AND (e.event_timezone IS NULL OR e.event_timezone = 'UTC');

-- Backfill UTC anchor from legacy DATE model using noon UTC to minimize boundary shifts.
UPDATE events
SET event_start_at_utc = (event_date::timestamp + INTERVAL '12 hours') AT TIME ZONE 'UTC'
WHERE event_start_at_utc IS NULL
  AND event_date IS NOT NULL;
