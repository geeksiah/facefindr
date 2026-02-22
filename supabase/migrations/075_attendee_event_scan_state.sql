-- Track attendee scan outcomes per event so we can block repeated
-- no-match scans until new media is uploaded.

CREATE TABLE IF NOT EXISTS attendee_event_scan_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    last_scan_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_result_match_count INTEGER NOT NULL DEFAULT 0 CHECK (last_result_match_count >= 0),
    last_media_count_at_scan INTEGER NOT NULL DEFAULT 0 CHECK (last_media_count_at_scan >= 0),
    last_latest_media_created_at_at_scan TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(attendee_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_attendee_event_scan_state_attendee
    ON attendee_event_scan_state(attendee_id);

CREATE INDEX IF NOT EXISTS idx_attendee_event_scan_state_event
    ON attendee_event_scan_state(event_id);

DROP TRIGGER IF EXISTS update_attendee_event_scan_state_updated_at
    ON attendee_event_scan_state;

CREATE TRIGGER update_attendee_event_scan_state_updated_at
    BEFORE UPDATE ON attendee_event_scan_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE attendee_event_scan_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attendees can view own event scan state"
    ON attendee_event_scan_state
    FOR SELECT
    USING (auth.uid() = attendee_id);

CREATE POLICY "Attendees can insert own event scan state"
    ON attendee_event_scan_state
    FOR INSERT
    WITH CHECK (auth.uid() = attendee_id);

CREATE POLICY "Attendees can update own event scan state"
    ON attendee_event_scan_state
    FOR UPDATE
    USING (auth.uid() = attendee_id);
