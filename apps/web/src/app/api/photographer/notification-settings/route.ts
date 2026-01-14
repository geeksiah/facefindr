/**
 * Photographer Notification Settings API
 * 
 * Get and update notification preferences.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Get notification settings
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Return defaults if no settings exist
    const defaultSettings = {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: true,
      
      // Notification types
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

    if (!settings) {
      return NextResponse.json({ settings: defaultSettings });
    }

    return NextResponse.json({
      settings: {
        emailEnabled: settings.email_enabled ?? true,
        smsEnabled: settings.sms_enabled ?? false,
        pushEnabled: settings.push_enabled ?? true,
        
        newPhotoSale: settings.new_photo_sale ?? true,
        payoutCompleted: settings.payout_completed ?? true,
        newEventView: settings.new_event_view ?? false,
        weeklyDigest: settings.weekly_digest ?? true,
        monthlyReport: settings.monthly_report ?? true,
        newFollower: settings.new_follower ?? true,
        eventReminder: settings.event_reminder ?? true,
        lowBalance: settings.low_balance ?? true,
        subscriptionReminder: settings.subscription_reminder ?? true,
        marketingEmails: settings.marketing_emails ?? false,
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

    // Upsert settings
    const { error } = await supabase
      .from('notification_settings')
      .upsert({
        user_id: user.id,
        email_enabled: body.emailEnabled,
        sms_enabled: body.smsEnabled,
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

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Update notification settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
