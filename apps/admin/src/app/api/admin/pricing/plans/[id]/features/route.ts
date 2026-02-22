import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import {
  ensureCoreCreatorPlanFeatures,
  normalizeFeaturePlanType,
} from '@/lib/pricing/core-features';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

function normalizeFeatureValueByType(featureType: string | null | undefined, value: any) {
  switch (featureType) {
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
      return Boolean(value);
    }
    case 'numeric':
    case 'limit': {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    }
    case 'text': {
      if (value === null || value === undefined) return '';
      return typeof value === 'string' ? value : String(value);
    }
    default:
      return value;
  }
}

// GET - Get features for a specific plan
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    // Get plan features using the helper function
    const { data, error } = await supabaseAdmin.rpc('get_plan_features', {
      p_plan_id: id,
    });

    if (error) throw error;

    // Also get all available features for this plan type
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('plan_type')
      .eq('id', id)
      .single();

    const normalizedPlanType = normalizeFeaturePlanType(plan?.plan_type);
    if (!normalizedPlanType || normalizedPlanType === 'creator') {
      await ensureCoreCreatorPlanFeatures(supabaseAdmin);
    }

    const { data: allAvailableFeatures, error: availableFeaturesError } = await supabaseAdmin
      .from('plan_features')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (availableFeaturesError) {
      throw availableFeaturesError;
    }

    const availableFeatures = (allAvailableFeatures || []).filter((feature: any) => {
      if (!normalizedPlanType) return true;
      const applicable = Array.isArray(feature.applicable_to) ? feature.applicable_to : [];
      if (normalizedPlanType === 'creator') {
        return applicable.includes('creator') || applicable.includes('photographer');
      }
      return applicable.includes(normalizedPlanType);
    });

    return NextResponse.json({
      assignedFeatures: data || [],
      availableFeatures: availableFeatures || [],
    });
  } catch (error) {
    console.error('Get plan features error:', error);
    return NextResponse.json({ error: 'Failed to get plan features' }, { status: 500 });
  }
}

// PUT - Update features for a plan
// Accepts either:
// - { features: Record<feature_code, value> } - simple map format
// - { features: Array<{ feature_id, feature_value }> } - array format
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
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
    const { features } = body;
    if (features === undefined) {
      return NextResponse.json({ error: 'Features payload is required' }, { status: 400 });
    }

    // Verify plan exists
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, code, name')
      .eq('id', id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Handle both formats
    let assignments: Array<{ plan_id: string; feature_id: string; feature_value: any }> = [];

    if (features) {
      if (Array.isArray(features)) {
        // Array format: [{ feature_id, feature_value }]
        const featureIds = Array.from(
          new Set(
            features
              .map((f: { feature_id?: string }) => f?.feature_id)
              .filter((value: any): value is string => typeof value === 'string' && value.length > 0)
          )
        );

        let featureTypeById = new Map<string, string>();
        if (featureIds.length > 0) {
          const { data: featureRows } = await supabaseAdmin
            .from('plan_features')
            .select('id, feature_type')
            .in('id', featureIds);
          featureTypeById = new Map(
            (featureRows || []).map((row: any) => [String(row.id), String(row.feature_type || '')])
          );
        }

        assignments = features
          .filter((f: { feature_id?: string }) => typeof f?.feature_id === 'string')
          .map((f: { feature_id: string; feature_value: any }) => ({
          plan_id: id,
          feature_id: f.feature_id,
          feature_value: normalizeFeatureValueByType(
            featureTypeById.get(f.feature_id),
            f.feature_value
          ),
        }));
      } else if (typeof features === 'object') {
        // Map format: { feature_code: value }
        // Need to look up feature IDs by code
        const featureCodes = Object.keys(features);
        
        if (featureCodes.length > 0) {
          const { data: featureRecords } = await supabaseAdmin
            .from('plan_features')
            .select('id, code, feature_type')
            .in('code', featureCodes);
          
          if (featureRecords) {
            const recordByCode = new Map(
              featureRecords.map((f: any) => [String(f.code), f])
            );
            
            assignments = featureCodes
              .filter(code => recordByCode.has(code))
              .map(code => ({
                plan_id: id,
                feature_id: recordByCode.get(code)!.id,
                feature_value: normalizeFeatureValueByType(
                  recordByCode.get(code)!.feature_type,
                  features[code]
                ),
              }));
          }
        }
      }
    }

    // Delete existing assignments after payload normalization succeeds.
    await supabaseAdmin
      .from('plan_feature_assignments')
      .delete()
      .eq('plan_id', id);

    if (assignments.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('plan_feature_assignments')
        .insert(assignments);

      if (insertError) throw insertError;
    }

    await logAction('plan_features_update', 'subscription_plan', id, {
      plan_code: plan.code,
      features_count: assignments.length,
    });
    await bumpRuntimeConfigVersion('pricing', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update plan features error:', error);
    return NextResponse.json({ error: 'Failed to update plan features' }, { status: 500 });
  }
}
