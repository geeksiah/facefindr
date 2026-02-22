import { createServiceClient } from '@/lib/supabase/server';

import { getNotificationCatalogEntry } from './catalog';

type ServiceClient = ReturnType<typeof createServiceClient>;

const DEFAULT_PREFS = {
  new_photo_sale_enabled: true,
  payout_completed_enabled: true,
  new_event_view_enabled: false,
  weekly_digest_enabled: true,
  monthly_report_enabled: true,
  new_follower_enabled: true,
  event_reminder_enabled: true,
  low_balance_enabled: true,
  subscription_reminder_enabled: true,
  tip_received_enabled: true,
  rating_received_enabled: true,
  photo_match_enabled: true,
  system_enabled: true,
  marketing_updates_enabled: false,
};

interface EligibilityContext {
  eventId?: string | null;
  requireEventParticipant?: boolean;
}

export interface DispatchInAppNotificationInput {
  recipientUserId: string;
  templateCode: string;
  subject: string;
  body: string;
  dedupeKey?: string | null;
  actionUrl?: string | null;
  details?: Record<string, unknown> | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  eligibilityContext?: EligibilityContext | null;
  supabase?: ServiceClient;
}

export interface DispatchInAppNotificationResult {
  sent: boolean;
  notificationId?: string;
  reason?:
    | 'disabled_template'
    | 'missing_recipient'
    | 'skipped_preference'
    | 'skipped_privacy'
    | 'skipped_eligibility'
    | 'duplicate_dropped'
    | 'insert_failed';
}

type DispatchOutcome =
  | 'delivered'
  | 'skipped_preference'
  | 'skipped_privacy'
  | 'skipped_eligibility'
  | 'duplicate_dropped'
  | 'insert_failed'
  | 'disabled_template'
  | 'missing_recipient';

function logDispatchOutcome(
  outcome: DispatchOutcome,
  input: DispatchInAppNotificationInput,
  extra?: Record<string, unknown>
) {
  console.info('[notifications.dispatch]', {
    outcome,
    templateCode: input.templateCode,
    recipientUserId: input.recipientUserId,
    dedupeKey: input.dedupeKey || null,
    eventId: input.eligibilityContext?.eventId || null,
    requireEventParticipant: Boolean(input.eligibilityContext?.requireEventParticipant),
    ...extra,
  });
}

async function getUserPreferences(
  supabase: ServiceClient,
  userId: string
): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('user_notification_preferences')
    .select(`
      new_photo_sale_enabled,
      payout_completed_enabled,
      new_event_view_enabled,
      weekly_digest_enabled,
      monthly_report_enabled,
      new_follower_enabled,
      event_reminder_enabled,
      low_balance_enabled,
      subscription_reminder_enabled,
      tip_received_enabled,
      rating_received_enabled,
      photo_match_enabled,
      system_enabled,
      marketing_updates_enabled
    `)
    .eq('user_id', userId)
    .maybeSingle();

  return {
    ...DEFAULT_PREFS,
    ...(data || {}),
  };
}

async function isAllowedByPrivacy(
  supabase: ServiceClient,
  recipientUserId: string,
  templateCode: string
): Promise<boolean> {
  if (templateCode !== 'social_new_follower') {
    return true;
  }

  const { data } = await supabase
    .from('user_privacy_settings')
    .select('allow_follows')
    .eq('user_id', recipientUserId)
    .maybeSingle();

  return data?.allow_follows !== false;
}

async function isEventParticipant(
  supabase: ServiceClient,
  recipientUserId: string,
  eventId: string
): Promise<boolean> {
  const [{ data: consent }, { data: entitlement }] = await Promise.all([
    supabase
      .from('attendee_consents')
      .select('id')
      .eq('attendee_id', recipientUserId)
      .eq('event_id', eventId)
      .is('withdrawn_at', null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('entitlements')
      .select('id')
      .eq('attendee_id', recipientUserId)
      .eq('event_id', eventId)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(consent?.id || entitlement?.id);
}

function coerceActionUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  return null;
}

function inferActionUrlFromDetails(details: Record<string, unknown> | null | undefined): string | null {
  if (!details) return null;
  const eventId = typeof details.eventId === 'string' ? details.eventId : null;
  const eventPath = typeof details.eventPath === 'string' ? details.eventPath : null;
  if (eventPath && eventPath.startsWith('/')) return eventPath;
  if (eventId) return `/gallery/events/${eventId}`;
  const profilePath = typeof details.profilePath === 'string' ? details.profilePath : null;
  if (profilePath && profilePath.startsWith('/')) return profilePath;
  return null;
}

export async function dispatchInAppNotification(
  input: DispatchInAppNotificationInput
): Promise<DispatchInAppNotificationResult> {
  if (!input.recipientUserId) {
    logDispatchOutcome('missing_recipient', input);
    return { sent: false, reason: 'missing_recipient' };
  }

  // Explicit policy: never emit unfollow notifications.
  if (input.templateCode === 'social_follower_removed') {
    logDispatchOutcome('disabled_template', input);
    return { sent: false, reason: 'disabled_template' };
  }

  const supabase = input.supabase || createServiceClient();
  const catalog = getNotificationCatalogEntry(input.templateCode);
  const prefs = await getUserPreferences(supabase, input.recipientUserId);

  if (prefs[catalog.preferenceKey] === false) {
    logDispatchOutcome('skipped_preference', input, { preferenceKey: catalog.preferenceKey });
    return { sent: false, reason: 'skipped_preference' };
  }

  const privacyAllowed = await isAllowedByPrivacy(supabase, input.recipientUserId, input.templateCode);
  if (!privacyAllowed) {
    logDispatchOutcome('skipped_privacy', input);
    return { sent: false, reason: 'skipped_privacy' };
  }

  const eventId = input.eligibilityContext?.eventId || null;
  if (eventId && input.eligibilityContext?.requireEventParticipant) {
    const eligible = await isEventParticipant(supabase, input.recipientUserId, eventId);
    if (!eligible) {
      logDispatchOutcome('skipped_eligibility', input, { eventId });
      return { sent: false, reason: 'skipped_eligibility' };
    }
  }

  const now = new Date().toISOString();
  const actionUrl = coerceActionUrl(input.actionUrl) || inferActionUrlFromDetails(input.details);

  const payload: Record<string, unknown> = {
    user_id: input.recipientUserId,
    template_code: input.templateCode,
    category: catalog.category,
    channel: 'in_app',
    subject: input.subject,
    body: input.body,
    status: 'delivered',
    sent_at: now,
    delivered_at: now,
    dedupe_key: input.dedupeKey || null,
    action_url: actionUrl,
    details: input.details || {},
    actor_user_id: input.actorUserId || null,
    is_hidden: false,
    metadata: {
      ...(input.metadata || {}),
      dedupe_key: input.dedupeKey || null,
      action_url: actionUrl,
    },
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      logDispatchOutcome('duplicate_dropped', input);
      return { sent: false, reason: 'duplicate_dropped' };
    }
    console.error('dispatchInAppNotification insert failed', {
      templateCode: input.templateCode,
      recipientUserId: input.recipientUserId,
      error,
    });
    logDispatchOutcome('insert_failed', input, { errorCode: error.code || null });
    return { sent: false, reason: 'insert_failed' };
  }

  logDispatchOutcome('delivered', input, { notificationId: data?.id || null });
  return { sent: true, notificationId: data?.id };
}
