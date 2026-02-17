export const dynamic = 'force-dynamic';

/**
 * Creator Notification Settings API
 * 
 * Get and update notification preferences.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

function isMissingRelationError(error: any) {
  return error?.code === '42P01' || error?.code === '42703';
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function defaultSettings() {
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

// GET - Get notification settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const defaults = defaultSettings();

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settings && !settingsError) {
      return NextResponse.json({
        settings: {
          emailEnabled: asBoolean(settings.email_enabled, defaults.emailEnabled),
          smsEnabled: asBoolean(settings.sms_enabled, defaults.smsEnabled),
          pushEnabled: asBoolean(settings.push_enabled, defaults.pushEnabled),
          newPhotoSale: asBoolean(settings.new_photo_sale, defaults.newPhotoSale),
          payoutCompleted: asBoolean(settings.payout_completed, defaults.payoutCompleted),
          newEventView: asBoolean(settings.new_event_view, defaults.newEventView),
          weeklyDigest: asBoolean(settings.weekly_digest, defaults.weeklyDigest),
          monthlyReport: asBoolean(settings.monthly_report, defaults.monthlyReport),
          newFollower: asBoolean(settings.new_follower, defaults.newFollower),
          eventReminder: asBoolean(settings.event_reminder, defaults.eventReminder),
          lowBalance: asBoolean(settings.low_balance, defaults.lowBalance),
          subscriptionReminder: asBoolean(settings.subscription_reminder, defaults.subscriptionReminder),
          marketingEmails: asBoolean(settings.marketing_emails, defaults.marketingEmails),
        },
      });
    }

    if (settingsError && !isMissingRelationError(settingsError)) {
      console.error('Get notification settings error:', settingsError);
      return NextResponse.json(
        { error: 'Failed to get settings' },
        { status: 500 }
      );
    }

    // Fallback schema: user_notification_preferences
    const { data: fallbackPrefs } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!fallbackPrefs) {
      return NextResponse.json({ settings: defaults });
    }

    return NextResponse.json({
      settings: {
        emailEnabled: asBoolean(fallbackPrefs.email_enabled, defaults.emailEnabled),
        smsEnabled: asBoolean(fallbackPrefs.sms_enabled, defaults.smsEnabled),
        pushEnabled: asBoolean(fallbackPrefs.push_enabled, defaults.pushEnabled),
        newPhotoSale: asBoolean(fallbackPrefs.photo_drop_enabled, defaults.newPhotoSale),
        payoutCompleted: asBoolean(fallbackPrefs.payout_updates_enabled, defaults.payoutCompleted),
        newEventView: asBoolean(fallbackPrefs.event_updates_enabled, defaults.newEventView),
        weeklyDigest: defaults.weeklyDigest,
        monthlyReport: defaults.monthlyReport,
        newFollower: asBoolean(fallbackPrefs.event_updates_enabled, defaults.newFollower),
        eventReminder: asBoolean(fallbackPrefs.event_updates_enabled, defaults.eventReminder),
        lowBalance: asBoolean(fallbackPrefs.payout_updates_enabled, defaults.lowBalance),
        subscriptionReminder: defaults.subscriptionReminder,
        marketingEmails: asBoolean(fallbackPrefs.marketing_enabled, defaults.marketingEmails),
      },
    });

  } catch (error) {
    console.error('Get notification settings error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

// PUT - Update notification settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Check if user is on Studio plan for SMS
    let smsEnabled = false;
    if (body.smsEnabled) {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('plan_id, subscription_plans(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      // Only allow SMS on Studio plan
      const planName = (subscription?.subscription_plans as { name?: string } | null)?.name?.toLowerCase();
      if (planName === 'studio') {
        smsEnabled = true;
      }
    }

    // Attempt legacy table first
    const { error: legacyError } = await supabase
      .from('notification_settings')
      .upsert({
        user_id: user.id,
        email_enabled: body.emailEnabled,
        sms_enabled: smsEnabled, // Enforced server-side
        push_enabled: body.pushEnabled,
        new_photo_sale: body.newPhotoSale,
        payout_completed: body.payoutCompleted,
        new_event_view: body.newEventView,
        weekly_digest: body.weeklyDigest,
        monthly_report: body.monthlyReport,
        new_follower: body.newFollower,
        event_reminder: body.eventReminder,
        low_balance: body.lowBalance,
        subscription_reminder: body.subscriptionReminder,
        marketing_emails: body.marketingEmails,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (legacyError && !isMissingRelationError(legacyError)) {
      console.error('Update error:', legacyError);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 400 }
      );
    }

    // Fallback schema (or dual-write for compatibility)
    const { error: fallbackError } = await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: user.id,
        email_enabled: asBoolean(body.emailEnabled, true),
        sms_enabled: smsEnabled,
        push_enabled: asBoolean(body.pushEnabled, true),
        photo_drop_enabled: asBoolean(body.newPhotoSale, true),
        event_updates_enabled: asBoolean(body.newEventView, true),
        payout_updates_enabled: asBoolean(body.payoutCompleted, true),
        marketing_enabled: asBoolean(body.marketingEmails, false),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (fallbackError && !isMissingRelationError(fallbackError)) {
      console.error('Fallback update error:', fallbackError);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, smsEnabled });

  } catch (error) {
    console.error('Update notification settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

