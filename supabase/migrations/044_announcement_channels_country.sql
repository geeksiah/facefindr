-- Add country targeting and SMS channel to platform announcements

ALTER TABLE platform_announcements
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS send_sms BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_platform_announcements_country
  ON platform_announcements(country_code)
  WHERE country_code IS NOT NULL;

-- Ensure announcement template exists for notification logging
INSERT INTO notification_templates (
  template_code,
  template_name,
  description,
  category,
  email_subject,
  email_body,
  sms_body,
  push_title,
  push_body,
  variables,
  is_active
) VALUES (
  'platform_announcement',
  'Platform Announcement',
  'Admin-created announcement sent to users',
  'announcement',
  '{{title}}',
  '{{content}}',
  '{{content}}',
  '{{title}}',
  '{{content}}',
  '["title", "content"]'::jsonb,
  TRUE
) ON CONFLICT (template_code) DO NOTHING;
