/**
 * Notification Service
 * 
 * Handles sending notifications across channels: Email, SMS, WhatsApp, Push.
 * Supports templates, user preferences, and provider fallbacks.
 */

import { createServiceClient } from '@/lib/supabase/server';

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
      email: adminSettings.emailEnabled,
      sms: adminSettings.smsEnabled,
      whatsapp: adminSettings.whatsappEnabled,
      push: adminSettings.pushEnabled,
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
        result = await sendEmail(userId, template, variables, userEmail, metadata);
        break;
      case 'sms':
        result = await sendSMS(userId, template, variables, userPrefs.phoneNumber, metadata);
        break;
      case 'whatsapp':
        result = await sendWhatsApp(userId, template, variables, userPrefs.whatsappNumber, metadata);
        break;
      case 'push':
        result = await sendPush(userId, template, variables, metadata);
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
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
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
      metadata,
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
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
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
      metadata: { ...metadata, phone },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'sms', error: error.message };
  }

  // Get SMS provider for user's country
  // In production, call the appropriate SMS API (Twilio, Africa's Talking, etc.)
  
  // For now, mark as pending (would be sent by background job)
  console.log(`[SMS] Would send to ${phone}: ${body}`);

  return { success: true, channel: 'sms', notificationId: notification.id };
}

async function sendWhatsApp(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  phone: string | null,
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
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
      metadata: { ...metadata, phone, template_id: template.whatsappTemplateId },
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'whatsapp', error: error.message };
  }

  // In production, call WhatsApp Business API
  console.log(`[WhatsApp] Would send to ${phone}: ${body}`);

  return { success: true, channel: 'whatsapp', notificationId: notification.id };
}

async function sendPush(
  userId: string,
  template: NotificationTemplate,
  variables: Record<string, string>,
  metadata?: Record<string, unknown>
): Promise<NotificationResult> {
  if (!template.pushBody) {
    return { success: false, channel: 'push', error: 'No push template' };
  }

  const supabase = createServiceClient();
  const title = template.pushTitle ? renderTemplate(template.pushTitle, variables) : 'FaceFindr';
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
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, channel: 'push', error: error.message };
  }

  // In production, send via FCM, APNs, or web push
  console.log(`[Push] Would send to ${userId}: ${title} - ${body}`);

  return { success: true, channel: 'push', notificationId: notification.id };
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
