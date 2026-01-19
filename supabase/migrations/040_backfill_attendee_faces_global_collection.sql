-- ============================================
-- BACKFILL ATTENDEE FACES TO GLOBAL COLLECTION
-- ============================================
-- This migration ensures all existing attendee faces are indexed
-- in the global collection for drop-in feature matching
--
-- Note: This is a placeholder migration. The actual indexing must be done
-- via an external script or Edge Function that:
-- 1. Fetches all attendee_face_profiles
-- 2. Downloads the original face scan images from storage
-- 3. Calls AWS Rekognition IndexFaces API to index them in the global collection
--
-- The face registration API (/api/faces/register) already indexes new faces
-- into the global collection, so this backfill is only needed for existing faces.

-- Create a function to track backfill status
CREATE TABLE IF NOT EXISTS face_indexing_backfill_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    rekognition_face_id VARCHAR(255) NOT NULL,
    indexed_in_global_collection BOOLEAN DEFAULT FALSE,
    indexed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(attendee_id, rekognition_face_id)
);

CREATE INDEX idx_backfill_status_attendee ON face_indexing_backfill_status(attendee_id);
CREATE INDEX idx_backfill_status_indexed ON face_indexing_backfill_status(indexed_in_global_collection) WHERE indexed_in_global_collection = FALSE;

-- Function to mark faces as needing backfill
CREATE OR REPLACE FUNCTION queue_face_backfill()
RETURNS void AS $$
BEGIN
    -- Insert all existing attendee face profiles that haven't been backfilled
    INSERT INTO face_indexing_backfill_status (attendee_id, rekognition_face_id, indexed_in_global_collection)
    SELECT 
        afp.attendee_id,
        afp.rekognition_face_id,
        FALSE
    FROM attendee_face_profiles afp
    WHERE afp.is_primary = TRUE
    AND NOT EXISTS (
        SELECT 1 FROM face_indexing_backfill_status fibs
        WHERE fibs.attendee_id = afp.attendee_id
        AND fibs.rekognition_face_id = afp.rekognition_face_id
    )
    ON CONFLICT (attendee_id, rekognition_face_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Run the queue function to populate backfill queue
SELECT queue_face_backfill();

-- Add comment explaining next steps
COMMENT ON TABLE face_indexing_backfill_status IS 
'Queue for backfilling existing attendee faces into global Rekognition collection. Use an external script/Edge Function to process records where indexed_in_global_collection = FALSE. For each record, download the original face scan image and call AWS Rekognition IndexFaces API.';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON face_indexing_backfill_status TO authenticated;
GRANT EXECUTE ON FUNCTION queue_face_backfill() TO authenticated;
