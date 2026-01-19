import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET - List all features
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const planType = searchParams.get('plan_type'); // 'photographer' | 'drop_in' | null (all)

    let query = supabaseAdmin
      .from('plan_features')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (planType) {
      query = query.contains('applicable_to', [planType]);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ features: data || [] });
  } catch (error) {
    console.error('Get features error:', error);
    return NextResponse.json({ error: 'Failed to get features' }, { status: 500 });
  }
}

// POST - Create a new feature
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      code,
      name,
      description,
      feature_type,
      default_value,
      applicable_to,
      category,
      display_order,
    } = body;

    // Check if code already exists
    const { data: existing } = await supabaseAdmin
      .from('plan_features')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Feature code already exists' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('plan_features')
      .insert({
        code,
        name,
        description,
        feature_type,
        default_value: default_value ? JSON.parse(JSON.stringify(default_value)) : null,
        applicable_to: applicable_to || ['photographer', 'drop_in'],
        category,
        display_order: display_order || 0,
      })
      .select()
      .single();

    if (error) throw error;

    await logAction('feature_create', 'plan_feature', data.id, { code, name });

    return NextResponse.json({ success: true, feature: data });
  } catch (error) {
    console.error('Create feature error:', error);
    return NextResponse.json({ error: 'Failed to create feature' }, { status: 500 });
  }
}
