import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

function normalizePlanTypeInput(planType: unknown): 'creator' | 'payg' | null {
  const normalized = String(planType || '').trim().toLowerCase();
  if (!normalized) return 'creator';
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

// GET - List all plans
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .order('base_price_usd', { ascending: true });

    if (error) throw error;

    const plans = (data || [])
      .filter((plan: any) => plan.plan_type !== 'drop_in')
      .map((plan: any) => ({
        ...plan,
        plan_type: plan.plan_type === 'photographer' ? 'creator' : plan.plan_type,
      }));
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    return NextResponse.json({ error: 'Failed to get plans' }, { status: 500 });
  }
}

// POST - Create a new plan
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
      name, code, description, features, base_price_usd, is_active, is_popular, prices,
      plan_type, // Add plan_type support
      platform_fee_percent, platform_fee_fixed, platform_fee_type,
      print_commission_percent, print_commission_fixed, print_commission_type
    } = body;

    const planType = normalizePlanTypeInput(plan_type);
    if (!planType) {
      return NextResponse.json(
        { error: 'Invalid plan type. Drop-In pricing is configured via credit settings.' },
        { status: 400 }
      );
    }

    // Check if code already exists for this plan type
    let duplicateCheck = await supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('code', code)
      .eq('plan_type', planType)
      .maybeSingle();

    if (duplicateCheck.error && isPlanTypeEnumError(duplicateCheck.error) && planType === 'creator') {
      duplicateCheck = await supabaseAdmin
        .from('subscription_plans')
        .select('id')
        .eq('code', code)
        .eq('plan_type', toLegacyPlanType(planType))
        .maybeSingle();
    }

    if (duplicateCheck.error) {
      throw duplicateCheck.error;
    }

    if (duplicateCheck.data) {
      return NextResponse.json({ error: 'Plan code already exists' }, { status: 400 });
    }

    const insertPayload = {
      name,
      code,
      description,
      features,
      base_price_usd,
      is_active: is_active ?? true,
      is_popular: is_popular ?? false,
      prices: prices || {},
      plan_type: planType,
      platform_fee_percent: platform_fee_percent ?? 20.0,
      platform_fee_fixed: platform_fee_fixed ?? 0,
      platform_fee_type: platform_fee_type ?? 'percent',
      print_commission_percent: print_commission_percent ?? 15.0,
      print_commission_fixed: print_commission_fixed ?? 0,
      print_commission_type: print_commission_type ?? 'percent',
    };

    let { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .insert(insertPayload)
      .select()
      .single();

    if (error && isPlanTypeEnumError(error) && planType === 'creator') {
      const retry = await supabaseAdmin
        .from('subscription_plans')
        .insert({
          ...insertPayload,
          plan_type: toLegacyPlanType(planType),
        })
        .select()
        .single();
      data = retry.data as any;
      error = retry.error as any;
    }

    if (error) throw error;

    await logAction('plan_create', 'subscription_plan', data.id, { name, code });
    await bumpRuntimeConfigVersion('plans', session.adminId);

    const normalizedData = {
      ...data,
      plan_type: data?.plan_type === 'photographer' ? 'creator' : data?.plan_type,
    };
    return NextResponse.json({ success: true, plan: normalizedData });
  } catch (error) {
    console.error('Create plan error:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
