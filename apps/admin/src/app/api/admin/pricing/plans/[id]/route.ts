import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { provisionCreatorPlanProviderMappings } from '@/lib/payments/provider-plan-provisioning';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

function normalizePlanTypeInput(planType: unknown): 'creator' | 'payg' | null {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'creator' || normalized === 'photographer') return 'creator';
  if (normalized === 'payg') return 'payg';
  return null;
}

function isPlanTypeEnumError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '22P02' && message.includes('plan_type');
}

function toLegacyPlanType(planType: 'creator' | 'payg'): 'photographer' | 'payg' {
  return planType === 'creator' ? 'photographer' : 'payg';
}

function normalizeTrialFeaturePolicyInput(
  value: unknown
): 'full_plan_access' | 'free_plan_limits' | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'full_plan_access';
  if (normalized === 'full_plan_access') return 'full_plan_access';
  if (normalized === 'free_plan_limits') return 'free_plan_limits';
  return null;
}

function parseTrialDurationDaysInput(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 14;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) return null;
  return parsed;
}

// PUT - Update a plan
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
    const { 
      name, code, description, features, base_price_usd, is_active, is_popular, prices,
      plan_type, // Add plan_type support
      platform_fee_percent, platform_fee_fixed, platform_fee_type,
      print_commission_percent, print_commission_fixed, print_commission_type,
      trial_enabled, trial_duration_days, trial_feature_policy, trial_auto_bill_enabled
    } = body;

    const normalizedPlanType = normalizePlanTypeInput(plan_type);
    if (plan_type !== undefined && !normalizedPlanType) {
      return NextResponse.json(
        { error: 'Invalid plan type. Drop-In pricing is configured via credit settings.' },
        { status: 400 }
      );
    }
    const trialFeaturePolicy =
      trial_feature_policy === undefined
        ? null
        : normalizeTrialFeaturePolicyInput(trial_feature_policy);
    if (trial_feature_policy !== undefined && !trialFeaturePolicy) {
      return NextResponse.json(
        { error: 'Invalid trial feature policy' },
        { status: 400 }
      );
    }
    const trialDurationDays =
      trial_duration_days === undefined
        ? null
        : parseTrialDurationDaysInput(trial_duration_days);
    if (trial_duration_days !== undefined && !trialDurationDays) {
      return NextResponse.json(
        { error: 'Trial duration must be between 1 and 30 days' },
        { status: 400 }
      );
    }

    // Check if code is taken by another plan of the same type
    if (code && normalizedPlanType) {
      let duplicateCheck = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('code', code)
        .eq('plan_type', normalizedPlanType)
        .neq('id', id)
        .maybeSingle();

      if (
        duplicateCheck.error &&
        isPlanTypeEnumError(duplicateCheck.error) &&
        normalizedPlanType === 'creator'
      ) {
        duplicateCheck = await supabaseAdmin
          .from('subscription_plans')
          .select('id')
          .eq('code', code)
          .eq('plan_type', toLegacyPlanType(normalizedPlanType))
          .neq('id', id)
          .maybeSingle();
      }

      if (duplicateCheck.error) {
        throw duplicateCheck.error;
      }

      if (duplicateCheck.data) {
        return NextResponse.json({ error: 'Plan code already exists for this plan type' }, { status: 400 });
      }
    }

    const updateData: any = {
      name,
      code,
      description,
      features,
      base_price_usd,
      is_active,
      is_popular,
      prices: prices || {},
      platform_fee_percent,
      platform_fee_fixed,
      platform_fee_type,
      print_commission_percent,
      print_commission_fixed,
      print_commission_type,
      updated_at: new Date().toISOString(),
    };

    // Include plan_type if provided
    if (normalizedPlanType) {
      updateData.plan_type = normalizedPlanType;
    }
    if (trial_enabled !== undefined) {
      updateData.trial_enabled = Boolean(trial_enabled);
    }
    if (trialDurationDays !== null) {
      updateData.trial_duration_days = trialDurationDays;
    }
    if (trialFeaturePolicy) {
      updateData.trial_feature_policy = trialFeaturePolicy;
    }
    if (trial_auto_bill_enabled !== undefined) {
      updateData.trial_auto_bill_enabled = Boolean(trial_auto_bill_enabled);
    }

    let { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error && isPlanTypeEnumError(error) && normalizedPlanType === 'creator') {
      const retry = await supabaseAdmin
        .from('subscription_plans')
        .update({
          ...updateData,
          plan_type: toLegacyPlanType(normalizedPlanType),
        })
        .eq('id', id)
        .select()
        .single();
      data = retry.data as any;
      error = retry.error as any;
    }

    if (error) throw error;

    let provisioning: Awaited<ReturnType<typeof provisionCreatorPlanProviderMappings>> | null = null;
    try {
      provisioning = await provisionCreatorPlanProviderMappings({
        id: String(data.id || id),
        code: String(data.code || code || ''),
        name: String(data.name || name || ''),
        description: data.description,
        planType: data.plan_type,
        prices: (data as any).prices || prices || {},
        trialEnabled: Boolean((data as any).trial_enabled),
        trialDurationDays: Number((data as any).trial_duration_days || 14),
        trialAutoBillEnabled: (data as any).trial_auto_bill_enabled !== false,
      });
    } catch (provisionError) {
      console.error('Provider plan auto-provisioning failed:', provisionError);
    }

    await logAction('plan_update', 'subscription_plan', id, {
      name,
      code,
      provider_provisioning_attempted: Boolean(provisioning?.attempted),
      provider_provisioning_warnings: provisioning?.warnings || [],
    });
    await bumpRuntimeConfigVersion('plans', session.adminId);

    const normalizedData = {
      ...data,
      plan_type: data?.plan_type === 'photographer' ? 'creator' : data?.plan_type,
    };
    return NextResponse.json({ success: true, plan: normalizedData, provisioning });
  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

// DELETE - Delete a plan
export async function DELETE(
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

    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('code, plan_type')
      .eq('id', id)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Check active creator subscriptions only for creator plans.
    const normalizedPlanType = normalizePlanTypeInput(plan.plan_type);
    if (normalizedPlanType === 'creator') {
      const { count } = await supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('plan_code', plan.code)
        .in('status', ['active', 'trialing', 'past_due']);

      if (count && count > 0) {
        return NextResponse.json(
          { error: 'Cannot delete plan with active subscriptions' },
          { status: 400 }
        );
      }
    }

    const { error } = await supabaseAdmin
      .from('subscription_plans')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await logAction('plan_delete', 'subscription_plan', id, {});
    await bumpRuntimeConfigVersion('plans', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
