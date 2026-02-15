import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

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

    const allowedPlanTypes = new Set(['photographer', 'drop_in', 'payg']);
    if (plan_type !== undefined && !allowedPlanTypes.has(plan_type)) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Check if code is taken by another plan of the same type
    if (code && plan_type) {
      const { data: existing } = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('code', code)
        .eq('plan_type', plan_type)
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
    if (plan_type) {
      updateData.plan_type = plan_type;
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

    // Check if any active subscriptions use this plan
    const { count } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
      .eq('status', 'active');

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete plan with active subscriptions' },
        { status: 400 }
      );
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
