import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

interface RouteParams {
  params: { id: string };
}

// GET - Get a specific feature
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const { data, error } = await supabaseAdmin
      .from('plan_features')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    return NextResponse.json({ feature: data });
  } catch (error) {
    console.error('Get feature error:', error);
    return NextResponse.json({ error: 'Failed to get feature' }, { status: 500 });
  }
}

// PUT - Update a feature
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const {
      name,
      description,
      feature_type,
      default_value,
      applicable_to,
      category,
      display_order,
      is_active,
    } = body;

    const { data, error } = await supabaseAdmin
      .from('plan_features')
      .update({
        name,
        description,
        feature_type,
        default_value: default_value !== undefined ? JSON.parse(JSON.stringify(default_value)) : undefined,
        applicable_to,
        category,
        display_order,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAction('feature_update', 'plan_feature', id, { name });

    return NextResponse.json({ success: true, feature: data });
  } catch (error) {
    console.error('Update feature error:', error);
    return NextResponse.json({ error: 'Failed to update feature' }, { status: 500 });
  }
}

// DELETE - Delete a feature
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = params;

    // Get feature info for logging
    const { data: feature } = await supabaseAdmin
      .from('plan_features')
      .select('code, name')
      .eq('id', id)
      .single();

    if (!feature) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    // Delete all assignments for this feature first
    await supabaseAdmin
      .from('plan_feature_assignments')
      .delete()
      .eq('feature_id', id);

    // Delete the feature
    const { error } = await supabaseAdmin
      .from('plan_features')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAction('feature_delete', 'plan_feature', id, { 
      code: feature.code, 
      name: feature.name 
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete feature error:', error);
    return NextResponse.json({ error: 'Failed to delete feature' }, { status: 500 });
  }
}
