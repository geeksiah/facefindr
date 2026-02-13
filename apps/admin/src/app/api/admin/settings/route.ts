import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Update each setting
    const updates = Object.entries(settings).map(async ([key, value]) => {
      return supabaseAdmin
        .from('platform_settings')
        .update({ 
          value: typeof value === 'string' ? value : JSON.stringify(value),
          updated_by: session.adminId,
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', key);
    });

    await Promise.all(updates);

    await logAction('settings_update', 'settings', undefined, { 
      updatedKeys: Object.keys(settings),
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
