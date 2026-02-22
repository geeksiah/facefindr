export const dynamic = 'force-dynamic';

/**
 * Creator Notification Settings API
 *
 * Canonical source of truth: public.user_notification_preferences.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

interface CreatorNotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  newPhotoSale: boolean;
  payoutCompleted: boolean;
  newEventView: boolean;
  weeklyDigest: boolean;
  monthlyReport: boolean;
  newFollower: boolean;
  eventReminder: boolean;
  lowBalance: boolean;
  subscriptionReminder: boolean;
  marketingEmails: boolean;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function defaultSettings(): CreatorNotificationSettings {
  return {
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true,
    newPhotoSale: true,
    payoutCompleted: true,
    newEventView: false,
    weeklyDigest: true,
    monthlyReport: true,
    newFollower: true,
    eventReminder: true,
    lowBalance: true,
    subscriptionReminder: true,
    marketingEmails: false,
  };
}

function mapFromRow(row: any): CreatorNotificationSettings {
  const defaults = defaultSettings();
  return {
    emailEnabled: asBoolean(row?.email_enabled, defaults.emailEnabled),
    smsEnabled: asBoolean(row?.sms_enabled, defaults.smsEnabled),
    pushEnabled: asBoolean(row?.push_enabled, defaults.pushEnabled),
    newPhotoSale: asBoolean(row?.new_photo_sale_enabled, defaults.newPhotoSale),
    payoutCompleted: asBoolean(row?.payout_completed_enabled, defaults.payoutCompleted),
    newEventView: asBoolean(row?.new_event_view_enabled, defaults.newEventView),
    weeklyDigest: asBoolean(row?.weekly_digest_enabled, defaults.weeklyDigest),
    monthlyReport: asBoolean(row?.monthly_report_enabled, defaults.monthlyReport),
    newFollower: asBoolean(row?.new_follower_enabled, defaults.newFollower),
    eventReminder: asBoolean(row?.event_reminder_enabled, defaults.eventReminder),
    lowBalance: asBoolean(row?.low_balance_enabled, defaults.lowBalance),
    subscriptionReminder: asBoolean(row?.subscription_reminder_enabled, defaults.subscriptionReminder),
    marketingEmails: asBoolean(row?.marketing_updates_enabled, defaults.marketingEmails),
  };
}

async function resolveStudioSmsPermission(supabase: any, userId: string, wantsSms: boolean) {
  if (!wantsSms) return false;

  const { data, error } = await supabase.rpc('get_photographer_limits', {
    p_photographer_id: userId,
  });

  if (error) {
    console.error('Failed to resolve creator plan for SMS gating:', error);
    return false;
  }

  const planCode = String(data?.[0]?.plan_code || '').toLowerCase();
  return planCode === 'studio';
}

// GET - Get notification settings
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data } = await supabase
      .from('user_notification_preferences')
      .select(`
        email_enabled,
        sms_enabled,
        push_enabled,
        new_photo_sale_enabled,
        payout_completed_enabled,
        new_event_view_enabled,
        weekly_digest_enabled,
        monthly_report_enabled,
        new_follower_enabled,
        event_reminder_enabled,
        low_balance_enabled,
        subscription_reminder_enabled,
        marketing_updates_enabled
      `)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ settings: defaultSettings() });
    }

    return NextResponse.json({ settings: mapFromRow(data) });
  } catch (error) {
    console.error('Get notification settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

// PUT - Update notification settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const defaults = defaultSettings();
    const smsEnabled = await resolveStudioSmsPermission(supabase, user.id, asBoolean(body.smsEnabled, false));

    const next: CreatorNotificationSettings = {
      emailEnabled: asBoolean(body.emailEnabled, defaults.emailEnabled),
      smsEnabled,
      pushEnabled: asBoolean(body.pushEnabled, defaults.pushEnabled),
      newPhotoSale: asBoolean(body.newPhotoSale, defaults.newPhotoSale),
      payoutCompleted: asBoolean(body.payoutCompleted, defaults.payoutCompleted),
      newEventView: asBoolean(body.newEventView, defaults.newEventView),
      weeklyDigest: asBoolean(body.weeklyDigest, defaults.weeklyDigest),
      monthlyReport: asBoolean(body.monthlyReport, defaults.monthlyReport),
      newFollower: asBoolean(body.newFollower, defaults.newFollower),
      eventReminder: asBoolean(body.eventReminder, defaults.eventReminder),
      lowBalance: asBoolean(body.lowBalance, defaults.lowBalance),
      subscriptionReminder: asBoolean(body.subscriptionReminder, defaults.subscriptionReminder),
      marketingEmails: asBoolean(body.marketingEmails, defaults.marketingEmails),
    };

    const { error } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: user.id,
          email_enabled: next.emailEnabled,
          sms_enabled: next.smsEnabled,
          push_enabled: next.pushEnabled,
          new_photo_sale_enabled: next.newPhotoSale,
          payout_completed_enabled: next.payoutCompleted,
          new_event_view_enabled: next.newEventView,
          weekly_digest_enabled: next.weeklyDigest,
          monthly_report_enabled: next.monthlyReport,
          new_follower_enabled: next.newFollower,
          event_reminder_enabled: next.eventReminder,
          low_balance_enabled: next.lowBalance,
          subscription_reminder_enabled: next.subscriptionReminder,
          marketing_updates_enabled: next.marketingEmails,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Update notification settings error:', error);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 400 });
    }

    return NextResponse.json({ success: true, smsEnabled: next.smsEnabled });
  } catch (error) {
    console.error('Update notification settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
