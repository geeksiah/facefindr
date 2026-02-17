import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET - list storage plans (including inactive)
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: plans, error } = await supabaseAdmin
      .from('storage_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      throw error;
    }

    const planIds = (plans || []).map((plan: any) => plan.id);
    const { data: subscriptions } = planIds.length
      ? await supabaseAdmin
          .from('storage_subscriptions')
          .select('plan_id')
          .in('plan_id', planIds)
          .eq('status', 'active')
      : { data: [] as any[] };

    const counts = new Map<string, number>();
    (subscriptions || []).forEach((subscription: any) => {
      counts.set(subscription.plan_id, (counts.get(subscription.plan_id) || 0) + 1);
    });

    const payload = (plans || []).map((plan: any) => ({
      ...plan,
      activeSubscriptions: counts.get(plan.id) || 0,
    }));

    return NextResponse.json({ plans: payload });
  } catch (error) {
    console.error('Get storage plans error:', error);
    return NextResponse.json({ error: 'Failed to get storage plans' }, { status: 500 });
  }
}

// POST - create storage plan
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
      name,
      slug,
      description,
      storage_limit_mb,
      photo_limit,
      price_monthly,
      price_yearly,
      currency,
      features,
      is_popular,
      is_active,
      sort_order,
    } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const { data: plan, error } = await supabaseAdmin
      .from('storage_plans')
      .insert({
        name,
        slug,
        description: description || null,
        storage_limit_mb: storage_limit_mb ?? 500,
        photo_limit: photo_limit ?? 50,
        price_monthly: price_monthly ?? 0,
        price_yearly: price_yearly ?? 0,
        currency: currency || 'USD',
        features: Array.isArray(features) ? features : [],
        is_popular: !!is_popular,
        is_active: is_active ?? true,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Storage plan slug already exists' }, { status: 400 });
      }
      throw error;
    }

    await logAction('storage_plan_create', 'storage_plan', plan.id, {
      name: plan.name,
      slug: plan.slug,
    });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('Create storage plan error:', error);
    return NextResponse.json({ error: 'Failed to create storage plan' }, { status: 500 });
  }
}

// PUT - update storage plan
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.storage_limit_mb !== undefined) updateData.storage_limit_mb = updates.storage_limit_mb;
    if (updates.photo_limit !== undefined) updateData.photo_limit = updates.photo_limit;
    if (updates.price_monthly !== undefined) updateData.price_monthly = updates.price_monthly;
    if (updates.price_yearly !== undefined) updateData.price_yearly = updates.price_yearly;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.features !== undefined) updateData.features = updates.features;
    if (updates.is_popular !== undefined) updateData.is_popular = updates.is_popular;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
    if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order;

    const { data: plan, error } = await supabaseAdmin
      .from('storage_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAction('storage_plan_update', 'storage_plan', id, {
      name: plan?.name,
      slug: plan?.slug,
    });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('Update storage plan error:', error);
    return NextResponse.json({ error: 'Failed to update storage plan' }, { status: 500 });
  }
}

// DELETE - deactivate storage plan
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const { count } = await supabaseAdmin
      .from('storage_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
      .eq('status', 'active');

    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate plan with ${count} active subscriptions` },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('storage_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    await logAction('storage_plan_deactivate', 'storage_plan', id, {});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete storage plan error:', error);
    return NextResponse.json({ error: 'Failed to deactivate storage plan' }, { status: 500 });
  }
}
