export type NotificationCategory =
  | 'transactions'
  | 'photos'
  | 'orders'
  | 'social'
  | 'system'
  | 'marketing';

export type NotificationPreferenceKey =
  | 'new_photo_sale_enabled'
  | 'payout_completed_enabled'
  | 'new_event_view_enabled'
  | 'weekly_digest_enabled'
  | 'monthly_report_enabled'
  | 'new_follower_enabled'
  | 'event_reminder_enabled'
  | 'low_balance_enabled'
  | 'subscription_reminder_enabled'
  | 'tip_received_enabled'
  | 'rating_received_enabled'
  | 'photo_match_enabled'
  | 'system_enabled'
  | 'marketing_updates_enabled';

export interface NotificationCatalogEntry {
  category: NotificationCategory;
  preferenceKey: NotificationPreferenceKey;
}

const DEFAULT_ENTRY: NotificationCatalogEntry = {
  category: 'system',
  preferenceKey: 'system_enabled',
};

export const NOTIFICATION_CATALOG: Record<string, NotificationCatalogEntry> = {
  purchase_completed: { category: 'orders', preferenceKey: 'new_photo_sale_enabled' },
  purchase_received: { category: 'orders', preferenceKey: 'new_photo_sale_enabled' },
  tip_sent: { category: 'transactions', preferenceKey: 'system_enabled' },
  tip_received: { category: 'transactions', preferenceKey: 'tip_received_enabled' },
  payout_completed: { category: 'transactions', preferenceKey: 'payout_completed_enabled' },
  payout_failed: { category: 'transactions', preferenceKey: 'payout_completed_enabled' },
  refund_processed: { category: 'transactions', preferenceKey: 'system_enabled' },
  subscription_failed: { category: 'transactions', preferenceKey: 'subscription_reminder_enabled' },
  subscription_renewed: { category: 'transactions', preferenceKey: 'subscription_reminder_enabled' },
  subscription_expired: { category: 'transactions', preferenceKey: 'subscription_reminder_enabled' },
  subscription_renewal_reminder: { category: 'transactions', preferenceKey: 'subscription_reminder_enabled' },
  event_new_photos: { category: 'photos', preferenceKey: 'photo_match_enabled' },
  drop_in_match: { category: 'photos', preferenceKey: 'photo_match_enabled' },
  creator_new_public_event: { category: 'social', preferenceKey: 'new_event_view_enabled' },
  social_new_follower: { category: 'social', preferenceKey: 'new_follower_enabled' },
  social_follower_removed: { category: 'social', preferenceKey: 'new_follower_enabled' },
  creator_new_rating: { category: 'social', preferenceKey: 'rating_received_enabled' },
  drop_in_connection_accepted: { category: 'social', preferenceKey: 'system_enabled' },
  drop_in_connection_declined: { category: 'social', preferenceKey: 'system_enabled' },
  event_collaboration_invite: { category: 'system', preferenceKey: 'system_enabled' },
  support_ticket_reply: { category: 'system', preferenceKey: 'system_enabled' },
  support_ticket_status_updated: { category: 'system', preferenceKey: 'system_enabled' },
  verification_otp: { category: 'system', preferenceKey: 'system_enabled' },
};

export function getNotificationCatalogEntry(templateCode: string): NotificationCatalogEntry {
  const key = String(templateCode || '').trim();
  if (!key) return DEFAULT_ENTRY;
  return NOTIFICATION_CATALOG[key] || DEFAULT_ENTRY;
}
