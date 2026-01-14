import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('verification_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error('Get verification settings error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();

    // Get current settings to update
    const { data: current } = await supabaseAdmin
      .from('verification_settings')
      .select('id')
      .limit(1)
      .single();

    if (current) {
      await supabaseAdmin
        .from('verification_settings')
        .update({
          ...body,
          updated_by: session.adminId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);
    } else {
      await supabaseAdmin
        .from('verification_settings')
        .insert({
          ...body,
          updated_by: session.adminId,
        });
    }

    await logAction('settings_update', 'verification_settings', undefined, {
      email_enabled: body.email_verification_enabled,
      phone_enabled: body.phone_verification_enabled,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update verification settings error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
