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

DO $$
DECLARE
  has_user_action boolean;
  has_user_action_at boolean;
  has_status boolean;
  recipient_set text;
  sender_status_set text;
  sender_notified_set text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drop_in_notifications'
      AND column_name = 'user_action'
  ) INTO has_user_action;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drop_in_notifications'
      AND column_name = 'user_action_at'
  ) INTO has_user_action_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drop_in_notifications'
      AND column_name = 'status'
  ) INTO has_status;

  recipient_set := 'recipient_decision = CASE';
  IF has_user_action THEN
    recipient_set := recipient_set ||
      ' WHEN user_action = ''accepted_connection'' THEN ''accepted_connection''' ||
      ' WHEN user_action = ''declined_connection'' THEN ''declined_connection''';
  END IF;
  IF has_status THEN
    recipient_set := recipient_set || ' WHEN status = ''dismissed'' THEN ''dismissed''';
  END IF;
  recipient_set := recipient_set || ' ELSE recipient_decision END';

  sender_status_set := 'sender_status = CASE';
  IF has_user_action THEN
    sender_status_set := sender_status_set ||
      ' WHEN user_action = ''accepted_connection'' THEN ''recipient_accepted''' ||
      ' WHEN user_action = ''declined_connection'' THEN ''recipient_declined''';
  END IF;
  IF has_status THEN
    sender_status_set := sender_status_set || ' WHEN status = ''viewed'' THEN ''recipient_viewed''';
  END IF;
  sender_status_set := sender_status_set || ' ELSE sender_status END';

  IF has_user_action THEN
    sender_notified_set := 'sender_notified_at = CASE' ||
      ' WHEN user_action IN (''accepted_connection'', ''declined_connection'') THEN COALESCE(sender_notified_at';
    IF has_user_action_at THEN
      sender_notified_set := sender_notified_set || ', user_action_at';
    END IF;
    sender_notified_set := sender_notified_set || ', NOW()) ELSE sender_notified_at END';
  ELSE
    sender_notified_set := 'sender_notified_at = sender_notified_at';
  END IF;

  EXECUTE format(
    'UPDATE public.drop_in_notifications SET %s, %s, %s',
    recipient_set,
    sender_status_set,
    sender_notified_set
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_sender_status
  ON drop_in_notifications(sender_status);

CREATE INDEX IF NOT EXISTS idx_drop_in_notifications_recipient_decision
  ON drop_in_notifications(recipient_decision)
  WHERE recipient_decision IS NOT NULL;
