-- Add collaboration invitation notification template
-- Ensures template metadata exists for in-app/email/push fan-out.

DO $$
BEGIN
  IF to_regclass('public.notification_templates') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_templates (
    template_code,
    template_name,
    description,
    category,
    email_subject,
    email_body,
    push_title,
    push_body,
    variables,
    is_active
  )
  VALUES (
    'event_collaboration_invite',
    'Event Collaboration Invite',
    'Creator invitation to collaborate on an event',
    'transactional',
    'You were invited to collaborate on {{event_name}}',
    'Hi {{invitee_name}}, {{inviter_name}} invited you to collaborate on "{{event_name}}" as {{role}}. Open your dashboard collaborations page to accept or decline.',
    'New Collaboration Invite',
    '{{inviter_name}} invited you to collaborate on {{event_name}}',
    '["invitee_name","inviter_name","event_name","role","event_id"]'::jsonb,
    TRUE
  )
  ON CONFLICT (template_code) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    email_subject = EXCLUDED.email_subject,
    email_body = EXCLUDED.email_body,
    push_title = EXCLUDED.push_title,
    push_body = EXCLUDED.push_body,
    variables = EXCLUDED.variables,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
END $$;

