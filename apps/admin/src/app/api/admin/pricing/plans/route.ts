import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

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

    return NextResponse.json({ plans: data || [] });
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

    // Check if code already exists for this plan type
    const planType = plan_type || 'photographer';
    const { data: existing } = await supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('code', code)
      .eq('plan_type', planType)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Plan code already exists' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .insert({
        name,
        code,
        description,
        features,
        base_price_usd,
        is_active: is_active ?? true,
        is_popular: is_popular ?? false,
        prices: prices || {},
        platform_fee_percent: platform_fee_percent ?? 20.00,
        platform_fee_fixed: platform_fee_fixed ?? 0,
        platform_fee_type: platform_fee_type ?? 'percent',
        print_commission_percent: print_commission_percent ?? 15.00,
        print_commission_fixed: print_commission_fixed ?? 0,
        print_commission_type: print_commission_type ?? 'percent',
      })
      .select()
      .single();

    if (error) throw error;

    await logAction('plan_create', 'subscription_plan', data.id, { name, code });
    await bumpRuntimeConfigVersion('plans', session.adminId);

    return NextResponse.json({ success: true, plan: data });
  } catch (error) {
    console.error('Create plan error:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
