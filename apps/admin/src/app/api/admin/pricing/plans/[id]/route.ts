import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

function normalizePlanTypeInput(planType: unknown): 'creator' | 'payg' | null {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'creator' || normalized === 'photographer') return 'creator';
  if (normalized === 'payg') return 'payg';
  return null;
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
      print_commission_percent, print_commission_fixed, print_commission_type
    } = body;

    const normalizedPlanType = normalizePlanTypeInput(plan_type);
    if (plan_type !== undefined && !normalizedPlanType) {
      return NextResponse.json(
        { error: 'Invalid plan type. Drop-In pricing is configured via credit settings.' },
        { status: 400 }
      );
    }

    // Check if code is taken by another plan of the same type
    if (code && normalizedPlanType) {
      const { data: existing } = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('code', code)
        .eq('plan_type', normalizedPlanType)
        .neq('id', id)
        .single();

      if (existing) {
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

    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAction('plan_update', 'subscription_plan', id, { name, code });
    await bumpRuntimeConfigVersion('plans', session.adminId);

    return NextResponse.json({ success: true, plan: data });
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
