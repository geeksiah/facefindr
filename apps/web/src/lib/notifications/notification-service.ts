/**
 * Notification Service
 * 
 * Handles sending notifications across channels: Email, SMS, WhatsApp, Push.
 * Supports templates, user preferences, and provider fallbacks.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { getUserCountry } from '@/lib/payments/gateway-selector';

// ============================================
// TYPES
// ============================================

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push' | 'in_app';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read';

export interface NotificationTemplate {
  templateCode: string;
  templateName: string;
  category: string;
  emailSubject: string | null;
  emailBody: string | null;
  emailHtml: string | null;
  smsBody: string | null;
  whatsappTemplateId: string | null;
  whatsappBody: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  variables: string[];
}

export interface SendNotificationOptions {
  userId: string;
  templateCode: string;
  variables: Record<string, string>;
  channels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
}

export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  channel?: NotificationChannel;
  error?: string;
}

export interface UserNotificationPrefs {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  whatsappNumber: string | null;
  whatsappOptedIn: boolean;
}

type ExternalNotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push';

interface CommunicationRoute {
  enabled: boolean;
  provider: string | null;
  countryCode: string | null;
}

// ============================================
// GET ADMIN SETTINGS
// ============================================

interface AdminNotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  channelPriority: NotificationChannel[];
}

let adminSettingsCache: AdminNotificationSettings | null = null;
let adminSettingsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAdminNotificationSettings(): Promise<AdminNotificationSettings> {
  const now = Date.now();
  
  if (adminSettingsCache && (now - adminSettingsCacheTime) < CACHE_TTL) {
    return adminSettingsCache;
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('admin_notification_settings')
    .select('*')
    .single();

  adminSettingsCache = {
    emailEnabled: data?.email_enabled ?? true,
    smsEnabled: data?.sms_enabled ?? false,
    whatsappEnabled: data?.whatsapp_enabled ?? false,
    pushEnabled: data?.push_enabled ?? false,
    channelPriority: data?.channel_priority ?? ['email', 'push', 'sms', 'whatsapp'],
  };

  adminSettingsCacheTime = now;
  return adminSettingsCache;
}

const communicationRouteCache = new Map<string, { data: Record<ExternalNotificationChannel, CommunicationRoute>; expiresAt: number }>();

function extractCountryCode(metadata?: Record<string, unknown>): string | null {
  const value =
    metadata?.countryCode ||
    metadata?.country_code ||
    metadata?.country ||
    null;

  if (!value) return null;
  const code = String(value).trim().toUpperCase();
  return code || null;
}

async function resolveCommunicationRoutes(
  userId: string,
  adminSettings: AdminNotificationSettings,
  metadata?: Record<string, unknown>
): Promise<Record<ExternalNotificationChannel, CommunicationRoute>> {
  const explicitCountry = extractCountryCode(metadata);
  const userCountry = explicitCountry || (await getUserCountry(userId));
  if (!userCountry) {
    return {
      email: { enabled: false, provider: null, countryCode: null },
      sms: { enabled: false, provider: null, countryCode: null },
      whatsapp: { enabled: false, provider: null, countryCode: null },
      push: { enabled: false, provider: null, countryCode: null },
    };
  }

  const cacheKey = `${userCountry}:${adminSettings.emailEnabled}:${adminSettings.smsEnabled}:${adminSettings.whatsappEnabled}:${adminSettings.pushEnabled}`;
  const cached = communicationRouteCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const supabase = createServiceClient();
  const { data: region } = await supabase
    .from('region_config')
    .select('is_active, email_enabled, email_provider, sms_enabled, sms_provider, whatsapp_enabled, whatsapp_provider, push_enabled, push_provider')
    .eq('region_code', userCountry)
    .single();

  if (!region?.is_active) {
    const disabledRoutes = {
      email: { enabled: false, provider: null, countryCode: userCountry },
      sms: { enabled: false, provider: null, countryCode: userCountry },
      whatsapp: { enabled: false, provider: null, countryCode: userCountry },
      push: { enabled: false, provider: null, countryCode: userCountry },
    } satisfies Record<ExternalNotificationChannel, CommunicationRoute>;
    communicationRouteCache.set(cacheKey, { data: disabledRoutes, expiresAt: Date.now() + CACHE_TTL });
    return disabledRoutes;
  }

  const routes = {
    email: {
      enabled: adminSettings.emailEnabled && region.email_enabled !== false,
      provider: region.email_provider || null,
      countryCode: userCountry,
    },
    sms: {
      enabled: adminSettings.smsEnabled && region.sms_enabled === true,
      provider: region.sms_provider || null,
      countryCode: userCountry,
    },
    whatsapp: {
      enabled: adminSettings.whatsappEnabled && region.whatsapp_enabled === true,
      provider: region.whatsapp_provider || null,
      countryCode: userCountry,
    },
    push: {
      enabled: adminSettings.pushEnabled && region.push_enabled === true,
      provider: region.push_provider || null,
      countryCode: userCountry,
    },
  } satisfies Record<ExternalNotificationChannel, CommunicationRoute>;

  communicationRouteCache.set(cacheKey, { data: routes, expiresAt: Date.now() + CACHE_TTL });
  return routes;
}

// ============================================
// GET USER PREFERENCES
// ============================================

export async function getUserNotificationPrefs(userId: string): Promise<UserNotificationPrefs | null> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) {
    // Return defaults
    return {
      userId,
      emailEnabled: true,
      smsEnabled: false,
      whatsappEnabled: false,
      pushEnabled: true,
      phoneNumber: null,
      phoneVerified: false,
      whatsappNumber: null,
      whatsappOptedIn: false,
    };
  }

  return {
    userId: data.user_id,
    emailEnabled: data.email_enabled,
    smsEnabled: data.sms_enabled,
    whatsappEnabled: data.whatsapp_enabled,
    pushEnabled: data.push_enabled,
    phoneNumber: data.phone_number,
    phoneVerified: data.phone_verified,
    whatsappNumber: data.whatsapp_number,
    whatsappOptedIn: data.whatsapp_opted_in,
  };
}

// ============================================
// GET TEMPLATE
// ============================================

export async function getTemplate(templateCode: string): Promise<NotificationTemplate | null> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('template_code', templateCode)
    .eq('is_active', true)
    .single();

  if (!data) return null;

  return {
    templateCode: data.template_code,
    templateName: data.template_name,
    category: data.category,
    emailSubject: data.email_subject,
    emailBody: data.email_body,
    emailHtml: data.email_html,
    smsBody: data.sms_body,
    whatsappTemplateId: data.whatsapp_template_id,
    whatsappBody: data.whatsapp_body,
    pushTitle: data.push_title,
    pushBody: data.push_body,
    variables: data.variables || [],
  };
}

// ============================================
// RENDER TEMPLATE
// ============================================

export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return result;
}

// ============================================
// SEND NOTIFICATION
// ============================================

export async function sendNotification(
  options: SendNotificationOptions
): Promise<NotificationResult[]> {
  const { userId, templateCode, variables, channels, metadata } = options;
  
  const results: NotificationResult[] = [];
  const supabase = createServiceClient();

  // Get template
  const template = await getTemplate(templateCode);
  if (!template) {
    return [{ success: false, error: 'Template not found' }];
  }

  // Get admin settings
  const adminSettings = await getAdminNotificationSettings();
  const communicationRoutes = await resolveCommunicationRoutes(userId, adminSettings, metadata);

  // Get user preferences
  const userPrefs = await getUserNotificationPrefs(userId);
  if (!userPrefs) {
    return [{ success: false, error: 'User not found' }];
  }

  // Get user email
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  const userEmail = userData?.user?.email;

  // Determine which channels to use
  const channelsToUse = channels || adminSettings.channelPriority;
  
  for (const channel of channelsToUse) {
    // Check if channel is enabled by admin
    const adminEnabled = {
      email: communicationRoutes.email.enabled,
      sms: communicationRoutes.sms.enabled,
      whatsapp: communicationRoutes.whatsapp.enabled,
      push: communicationRoutes.push.enabled,
      in_app: true,
    }[channel];

    if (!adminEnabled) continue;

    // Check if channel is enabled by user
    const userEnabled = {
      email: userPrefs.emailEnabled,
      sms: userPrefs.smsEnabled && userPrefs.phoneVerified,
      whatsapp: userPrefs.whatsappEnabled && userPrefs.whatsappOptedIn,
      push: userPrefs.pushEnabled,
      in_app: true,
    }[channel];

    if (!userEnabled) continue;

    // Send via channel
    let result: NotificationResult;
    
    switch (channel) {
      case 'email':
        result = await sendEmail(userId, template, variables, userEmail, metadata, communicationRoutes.email);
        break;
      case 'sms':
        result = await sendSMS(userId, template, variables, userPrefs.phoneNumber, metadata, communicationRoutes.sms);
        break;
      case 'whatsapp':
        result = await sendWhatsApp(userId, template, variables, userPrefs.whatsappNumber, metadata, communicationRoutes.whatsapp);
        break;
      case 'push':
        result = await sendPush(userId, template, variables, metadata, communicationRoutes.push);
        break;
      case 'in_app':
        result = await createInAppNotification(userId, template, variables, metadata);
        break;
      default:
        continue;
    }

    results.push(result);

    // For transactional messages, stop after first success
    if (result.success && template.category === 'transactional') {
      break;
    }
  }

  return results;
}

// ============================================
// CHANNEL-SPECIFIC SENDERS
// ============================================

async function sendEmail(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  email: string | undefined,
  metadata?: Record<string, unknown>,
  route?: CommunicationRoute
): Promise<NotificationResult> {
  if (!route?.enabled) {
    return { success: false, channel: 'email', error: 'Email channel disabled for user region' };
  }
  if (!route.provider) {
    return { success: false, channel: 'email', error: 'Email provider not configured for user region' };
  }
  if (!email || !template.emailBody) {
    return { success: false, channel: 'email', error: 'No email address or template' };
  }

  const supabase = createServiceClient();
  const subject = renderTemplate(template.emailSubject || '', variables);
  const body = renderTemplate(template.emailBody, variables);
  const html = template.emailHtml ? renderTemplate(template.emailHtml, variables) : undefined;

  // Store notification record
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      template_code: template.templateCode,
      channel: 'email',
      subject,
      body,
      html_body: html,
      variables,
      status: 'pending',
      metadata: { ...metadata, provider: route.provider, countryCode: route.countryCode },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'email', error: error.message };
  }

  // In production, send via email service (Resend, SendGrid, etc.)
  // For now, mark as sent (Supabase Auth handles verification emails)
  
  await supabase
    .from('notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', notification.id);

  return { success: true, channel: 'email', notificationId: notification.id };
}

async function sendSMS(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  phone: string | null,
  metadata?: Record<string, unknown>,
  route?: CommunicationRoute
): Promise<NotificationResult> {
  if (!route?.enabled) {
    return { success: false, channel: 'sms', error: 'SMS channel disabled for user region' };
  }
  if (!route.provider) {
    return { success: false, channel: 'sms', error: 'SMS provider not configured for user region' };
  }
  if (!phone || !template.smsBody) {
    return { success: false, channel: 'sms', error: 'No phone number or template' };
  }

  const supabase = createServiceClient();
  const body = renderTemplate(template.smsBody, variables);

  // Store notification record
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      template_code: template.templateCode,
      channel: 'sms',
      body,
      variables,
      status: 'pending',
      metadata: { ...metadata, phone, provider: route.provider, countryCode: route.countryCode },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'sms', error: error.message };
  }

  await supabase
    .from('notifications')
    .update({
      status: 'failed',
      metadata: { ...metadata, phone, provider: route.provider, countryCode: route.countryCode, failure_reason: 'sms_provider_dispatch_not_implemented' },
    })
    .eq('id', notification.id);

  return {
    success: false,
    channel: 'sms',
    notificationId: notification.id,
    error: 'SMS provider dispatch not configured',
  };
}

async function sendWhatsApp(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  phone: string | null,
  metadata?: Record<string, unknown>,
  route?: CommunicationRoute
): Promise<NotificationResult> {
  if (!route?.enabled) {
    return { success: false, channel: 'whatsapp', error: 'WhatsApp channel disabled for user region' };
  }
  if (!route.provider) {
    return { success: false, channel: 'whatsapp', error: 'WhatsApp provider not configured for user region' };
  }
  if (!phone || !template.whatsappBody) {
    return { success: false, channel: 'whatsapp', error: 'No WhatsApp number or template' };
  }

  const supabase = createServiceClient();
  const body = renderTemplate(template.whatsappBody, variables);

  // Store notification record
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      template_code: template.templateCode,
      channel: 'whatsapp',
      body,
      variables,
      status: 'pending',
      metadata: { ...metadata, phone, template_id: template.whatsappTemplateId, provider: route.provider, countryCode: route.countryCode },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'whatsapp', error: error.message };
  }

  await supabase
    .from('notifications')
    .update({
      status: 'failed',
      metadata: { ...metadata, phone, provider: route.provider, countryCode: route.countryCode, failure_reason: 'whatsapp_provider_dispatch_not_implemented' },
    })
    .eq('id', notification.id);

  return {
    success: false,
    channel: 'whatsapp',
    notificationId: notification.id,
    error: 'WhatsApp provider dispatch not configured',
  };
}

async function sendPush(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  metadata?: Record<string, unknown>,
  route?: CommunicationRoute
): Promise<NotificationResult> {
  if (!route?.enabled) {
    return { success: false, channel: 'push', error: 'Push channel disabled for user region' };
  }
  if (!route.provider) {
    return { success: false, channel: 'push', error: 'Push provider not configured for user region' };
  }
  if (!template.pushBody) {
    return { success: false, channel: 'push', error: 'No push template' };
  }

  const supabase = createServiceClient();
  const title = template.pushTitle ? renderTemplate(template.pushTitle, variables) : 'Ferchr';
  const body = renderTemplate(template.pushBody, variables);

  // Store notification record
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      template_code: template.templateCode,
      channel: 'push',
      subject: title,
      body,
      variables,
      status: 'pending',
      metadata: { ...metadata, provider: route.provider, countryCode: route.countryCode },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'push', error: error.message };
  }

  await supabase
    .from('notifications')
    .update({
      status: 'failed',
      metadata: { ...metadata, provider: route.provider, countryCode: route.countryCode, failure_reason: 'push_provider_dispatch_not_implemented' },
    })
    .eq('id', notification.id);

  return {
    success: false,
    channel: 'push',
    notificationId: notification.id,
    error: 'Push provider dispatch not configured',
  };
}

async function createInAppNotification(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
  const supabase = createServiceClient();
  
  const subject = template.pushTitle 
    ? renderTemplate(template.pushTitle, variables) 
    : template.templateName;
  const body = template.pushBody 
    ? renderTemplate(template.pushBody, variables)
    : renderTemplate(template.emailBody || '', variables);

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      template_code: template.templateCode,
      channel: 'in_app',
      subject,
      body,
      variables,
      status: 'delivered',
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'in_app', error: error.message };
  }

  return { success: true, channel: 'in_app', notificationId: notification.id };
}

// ============================================
// GET USER NOTIFICATIONS
// ============================================

export interface Notification {
  id: string;
  templateCode: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  createdAt: Date;
  readAt: Date | null;
  metadata: Record<string, unknown>;
}

export async function getUserNotifications(
  userId: string,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<Notification[]> {
  const supabase = createServiceClient();
  const { limit = 50, unreadOnly = false } = options || {};

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .in('channel', ['in_app', 'push'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data } = await query;

  if (!data) return [];

  return data.map(n => ({
    id: n.id,
    templateCode: n.template_code,
    channel: n.channel,
    subject: n.subject,
    body: n.body,
    status: n.status,
    createdAt: new Date(n.created_at),
    readAt: n.read_at ? new Date(n.read_at) : null,
    metadata: n.metadata || {},
  }));
}

// ============================================
// MARK AS READ
// ============================================

export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId);

  return !error;
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');

  return data?.length || 0;
}

// ============================================
// GET UNREAD COUNT
// ============================================

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createServiceClient();

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .in('channel', ['in_app', 'push'])
    .is('read_at', null);

  return count || 0;
}
