import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('region_config')
      .select('*')
      .eq('region_code', params.code.toUpperCase())
      .single();

    if (error) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    return NextResponse.json({ region: data });
  } catch (error) {
    console.error('Get region error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    
    const { error } = await supabaseAdmin
      .from('region_config')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('region_code', params.code.toUpperCase());

    if (error) throw error;

    await logAction('settings_update', 'region_config', undefined, {
      region_code: params.code,
      changes: Object.keys(body),
    });
    await bumpRuntimeConfigVersion('regions', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update region error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
