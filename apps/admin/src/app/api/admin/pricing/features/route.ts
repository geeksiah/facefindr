import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import {
  ensureCoreCreatorPlanFeatures,
  normalizeFeaturePlanType,
} from '@/lib/pricing/core-features';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

function isLegacyPlanTypeEnumError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '22P02' && message.includes('plan_type');
}

function toLegacyApplicableTo(values: string[] | undefined): string[] {
  return (values || []).map((value) => (value === 'creator' ? 'photographer' : value));
}

// GET - List all features
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const planType = searchParams.get('plan_type'); // 'creator' | 'photographer' | 'drop_in' | 'payg' | null
    const normalizedPlanType = normalizeFeaturePlanType(planType);

    // Safety net for older databases where this feature was never seeded.
    if (!normalizedPlanType || normalizedPlanType === 'creator') {
      await ensureCoreCreatorPlanFeatures(supabaseAdmin);
    }

    const query = supabaseAdmin
      .from('plan_features')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    const allFeatures = data || [];
    const filtered = !normalizedPlanType
      ? allFeatures
      : normalizedPlanType === 'creator'
      ? allFeatures.filter((feature: any) => {
          const applicable = Array.isArray(feature.applicable_to) ? feature.applicable_to : [];
          return applicable.includes('creator') || applicable.includes('photographer');
        })
      : allFeatures.filter((feature: any) => {
          const applicable = Array.isArray(feature.applicable_to) ? feature.applicable_to : [];
          return applicable.includes(normalizedPlanType);
        });

    return NextResponse.json({ features: filtered });
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

    const basePayload = {
      code,
      name,
      description,
      feature_type,
      default_value: default_value ? JSON.parse(JSON.stringify(default_value)) : null,
      applicable_to: applicable_to || ['creator', 'drop_in'],
      category,
      display_order: display_order || 0,
    };

    let { data, error } = await supabaseAdmin
      .from('plan_features')
      .insert(basePayload)
      .select()
      .single();

    if (error && isLegacyPlanTypeEnumError(error)) {
      const retry = await supabaseAdmin
        .from('plan_features')
        .insert({
          ...basePayload,
          applicable_to: toLegacyApplicableTo(basePayload.applicable_to),
        })
        .select()
        .single();
      data = retry.data as any;
      error = retry.error as any;
    }

    if (error) throw error;

    await logAction('feature_create', 'plan_feature', data.id, { code, name });
    await bumpRuntimeConfigVersion('pricing', session.adminId);

    return NextResponse.json({ success: true, feature: data });
  } catch (error) {
    console.error('Create feature error:', error);
    return NextResponse.json({ error: 'Failed to create feature' }, { status: 500 });
  }
}
