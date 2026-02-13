import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

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

    let availableFeaturesQuery = supabaseAdmin
      .from('plan_features')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (plan?.plan_type) {
      availableFeaturesQuery = availableFeaturesQuery.contains('applicable_to', [plan.plan_type]);
    }

    const { data: availableFeatures } = await availableFeaturesQuery;

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

    // Verify plan exists
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, code, name')
      .eq('id', id)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Delete existing assignments
    await supabaseAdmin
      .from('plan_feature_assignments')
      .delete()
      .eq('plan_id', id);

    // Handle both formats
    if (features) {
      let assignments: Array<{ plan_id: string; feature_id: string; feature_value: any }> = [];
      
      if (Array.isArray(features)) {
        // Array format: [{ feature_id, feature_value }]
        assignments = features.map((f: { feature_id: string; feature_value: any }) => ({
          plan_id: id,
          feature_id: f.feature_id,
          feature_value: typeof f.feature_value === 'string' 
            ? JSON.parse(f.feature_value) 
            : f.feature_value,
        }));
      } else if (typeof features === 'object') {
        // Map format: { feature_code: value }
        // Need to look up feature IDs by code
        const featureCodes = Object.keys(features);
        
        if (featureCodes.length > 0) {
          const { data: featureRecords } = await supabaseAdmin
            .from('plan_features')
            .select('id, code')
            .in('code', featureCodes);
          
          if (featureRecords) {
            const codeToId = new Map(featureRecords.map(f => [f.code, f.id]));
            
            assignments = featureCodes
              .filter(code => codeToId.has(code))
              .map(code => ({
                plan_id: id,
                feature_id: codeToId.get(code)!,
                feature_value: features[code],
              }));
          }
        }
      }

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
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update plan features error:', error);
    return NextResponse.json({ error: 'Failed to update plan features' }, { status: 500 });
  }
}
