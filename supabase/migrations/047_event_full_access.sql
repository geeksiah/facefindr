-- Event Full Access
-- Allows specific users (employers, clients, VIPs) to have full access to all event photos
-- without needing to use face scan

-- Create event_full_access table
CREATE TABLE IF NOT EXISTS event_full_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL CHECK (user_type IN ('employer', 'client', 'vip', 'staff')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(event_id, user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_event_full_access_event ON event_full_access(event_id);
CREATE INDEX IF NOT EXISTS idx_event_full_access_user ON event_full_access(user_id);
CREATE INDEX IF NOT EXISTS idx_event_full_access_active ON event_full_access(event_id, user_id) WHERE is_active = true;

-- RLS policies
ALTER TABLE event_full_access ENABLE ROW LEVEL SECURITY;

-- Photographers can manage full access for their events
CREATE POLICY "Photographers can manage event full access"
  ON event_full_access
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_full_access.event_id
      AND e.photographer_id = auth.uid()
    )
  );

-- Collaborators can view full access list
CREATE POLICY "Collaborators can view event full access"
  ON event_full_access
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_collaborators ec
      WHERE ec.event_id = event_full_access.event_id
      AND ec.photographer_id = auth.uid()
      AND ec.status = 'accepted'
    )
  );

-- Users can see their own full access grants
CREATE POLICY "Users can see own full access"
  ON event_full_access
  FOR SELECT
  USING (user_id = auth.uid());

-- Function to check if user has full access to an event
CREATE OR REPLACE FUNCTION has_event_full_access(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_access BOOLEAN := false;
BEGIN
  -- Check if user is the event photographer
  SELECT EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id AND photographer_id = p_user_id
  ) INTO v_has_access;
  
  IF v_has_access THEN
    RETURN true;
  END IF;
  
  -- Check if user is a collaborator
  SELECT EXISTS (
    SELECT 1 FROM event_collaborators
    WHERE event_id = p_event_id
    AND photographer_id = p_user_id
    AND status = 'accepted'
  ) INTO v_has_access;
  
  IF v_has_access THEN
    RETURN true;
  END IF;
  
  -- Check if user has explicit full access grant
  SELECT EXISTS (
    SELECT 1 FROM event_full_access
    WHERE event_id = p_event_id
    AND user_id = p_user_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_has_access;
  
  RETURN v_has_access;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION has_event_full_access TO authenticated;

COMMENT ON TABLE event_full_access IS 'Grants full photo access to specific users (employers, clients, VIPs) for events';
COMMENT ON FUNCTION has_event_full_access IS 'Checks if a user has full access to all photos in an event (as owner, collaborator, or granted access)';
