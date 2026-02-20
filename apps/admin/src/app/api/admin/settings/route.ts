import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('setting_key, value, description, category')
      .order('category', { ascending: true })
      .order('setting_key', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ settings: data || [] });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
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

    const { settings } = await request.json();
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
    }

    const entries = Object.entries(settings).filter(
      ([key, value]) => typeof key === 'string' && key.trim().length > 0 && value !== undefined
    );
    if (!entries.length) {
      return NextResponse.json({ error: 'No settings provided' }, { status: 400 });
    }

    // Upsert each setting so missing keys are created instead of silently skipped.
    const updates = entries.map(async ([key, value]) => {
      const normalizedValue = typeof value === 'string' ? value : value;

      const { error } = await supabaseAdmin
        .from('platform_settings')
        .upsert(
          {
            setting_key: key,
            value: normalizedValue,
            updated_by: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key' }
        );

      if (error) {
        throw error;
      }
    });

    await Promise.all(updates);

    await logAction('settings_update', 'settings', undefined, { 
      updatedKeys: entries.map(([key]) => key),
    });
    await bumpRuntimeConfigVersion('settings', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
