-- Drop-In sender lifecycle normalization.
-- Tracks recipient decision and sender notification status for upload-someone flow.

ALTER TABLE drop_in_notifications
  ADD COLUMN IF NOT EXISTS recipient_decision VARCHAR(30),
  ADD COLUMN IF NOT EXISTS sender_status VARCHAR(40) NOT NULL DEFAULT 'pending_recipient_decision',
  ADD COLUMN IF NOT EXISTS sender_notified_at TIMESTAMPTZ;

ALTER TABLE drop_in_notifications
  DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_recipient_decision;

ALTER TABLE drop_in_notifications
  ADD CONSTRAINT chk_drop_in_notifications_recipient_decision
  CHECK (
    recipient_decision IS NULL
    OR recipient_decision IN ('accepted_connection', 'declined_connection', 'dismissed')
  );

ALTER TABLE drop_in_notifications
  DROP CONSTRAINT IF EXISTS chk_drop_in_notifications_sender_status;

ALTER TABLE drop_in_notifications
  ADD CONSTRAINT chk_drop_in_notifications_sender_status
  CHECK (
    sender_status IN (
      'pending_recipient_decision',
      'recipient_viewed',
      'recipient_accepted',
      'recipient_declined',
      'sender_notified'
    )
  );

UPDATE drop_in_notifications
SET
  recipient_decision = CASE
    WHEN user_action = 'accepted_connection' THEN 'accepted_connection'
    WHEN user_action = 'declined_connection' THEN 'declined_connection'
    WHEN status = 'dismissed' THEN 'dismissed'
    ELSE recipient_decision
  END,
  sender_status = CASE
    WHEN user_action = 'accepted_connection' THEN 'recipient_accepted'
    WHEN user_action = 'declined_connection' THEN 'recipient_declined'
    WHEN status = 'viewed' THEN 'recipient_viewed'
    ELSE sender_status
  END,
  sender_notified_at = CASE
    WHEN user_action IN ('accepted_connection', 'declined_connection')
      THEN COALESCE(sender_notified_at, user_action_at, NOW())
    ELSE sender_notified_at
  END
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_sender_status
  ON drop_in_notifications(sender_status);

CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_recipient_decision
  ON drop_in_notifications(recipient_decision)
  WHERE recipient_decision IS NOT NULL;
