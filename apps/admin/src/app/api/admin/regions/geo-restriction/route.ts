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
      .from('geo_restriction')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;

    return NextResponse.json({ config: data });
  } catch (error) {
    console.error('Get geo restriction error:', error);
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

    // Get current config to update
    const { data: current } = await supabaseAdmin
      .from('geo_restriction')
      .select('id')
      .limit(1)
      .single();

    if (current) {
      await supabaseAdmin
        .from('geo_restriction')
        .update({
          ...body,
          updated_by: session.adminId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);
    } else {
      await supabaseAdmin
        .from('geo_restriction')
        .insert({
          ...body,
          updated_by: session.adminId,
        });
    }

    await logAction('settings_update', 'geo_restriction', undefined, {
      restriction_mode: body.restriction_mode,
      allowed_countries: body.allowed_countries?.length,
      blocked_countries: body.blocked_countries?.length,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update geo restriction error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
