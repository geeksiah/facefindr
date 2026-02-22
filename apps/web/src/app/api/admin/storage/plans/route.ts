export const dynamic = 'force-dynamic';

/**
 * Admin Storage Plans Management API
 * 
 * GET - List all storage plans (including inactive)
 * POST - Create a new storage plan
 * PUT - Update a storage plan
 * DELETE - Soft delete a storage plan
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// Helper to check admin status
async function isAdmin(supabase: any, email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .single();
  
  return !!data;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await isAdmin(supabase, user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: plans, error } = await supabase
      .from('storage_plans')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching storage plans:', error);
      return NextResponse.json(
        { error: 'Failed to fetch storage plans' },
        { status: 500 }
      );
    }

    // Get subscription counts for each plan
    const planIds = plans.map((p: any) => p.id);
    const { data: subscriptionCounts } = await supabase
      .from('storage_subscriptions')
      .select('plan_id')
      .in('plan_id', planIds)
      .eq('status', 'active');

    const countMap: Record<string, number> = {};
    (subscriptionCounts || []).forEach((s: any) => {
      countMap[s.plan_id] = (countMap[s.plan_id] || 0) + 1;
    });

    const plansWithCounts = plans.map((plan: any) => ({
      ...plan,
      photo_limit: -1,
      activeSubscriptions: countMap[plan.id] || 0,
    }));

    return NextResponse.json({ plans: plansWithCounts });
  } catch (error) {
    console.error('Admin storage plans error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await isAdmin(supabase, user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      slug,
      description,
      storageLimitMb: storageLimitMbCamel,
      storage_limit_mb: storageLimitMbSnake,
      priceMonthly: priceMonthlyCamel,
      price_monthly: priceMonthlySnake,
      priceYearly: priceYearlyCamel,
      price_yearly: priceYearlySnake,
      currency,
      features,
      isPopular: isPopularCamel,
      is_popular: isPopularSnake,
      sortOrder: sortOrderCamel,
      sort_order: sortOrderSnake,
    } = body;
    const storageLimitMb = storageLimitMbCamel ?? storageLimitMbSnake;
    const priceMonthly = priceMonthlyCamel ?? priceMonthlySnake;
    const priceYearly = priceYearlyCamel ?? priceYearlySnake;
    const isPopular = isPopularCamel ?? isPopularSnake;
    const sortOrder = sortOrderCamel ?? sortOrderSnake;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      );
    }

    const { data: plan, error } = await supabase
      .from('storage_plans')
      .insert({
        name,
        slug,
        description,
        storage_limit_mb: storageLimitMb ?? 500,
        photo_limit: -1,
        price_monthly: priceMonthly ?? 0,
        price_yearly: priceYearly ?? 0,
        currency: currency ?? 'USD',
        features: features ?? [],
        is_popular: isPopular ?? false,
        sort_order: sortOrder ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating storage plan:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A plan with this slug already exists' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create storage plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Admin create storage plan error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await isAdmin(supabase, user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Map camelCase to snake_case
    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.storageLimitMb !== undefined || updates.storage_limit_mb !== undefined) {
      updateData.storage_limit_mb = updates.storageLimitMb ?? updates.storage_limit_mb;
    }
    if (updates.priceMonthly !== undefined || updates.price_monthly !== undefined) {
      updateData.price_monthly = updates.priceMonthly ?? updates.price_monthly;
    }
    if (updates.priceYearly !== undefined || updates.price_yearly !== undefined) {
      updateData.price_yearly = updates.priceYearly ?? updates.price_yearly;
    }
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.features !== undefined) updateData.features = updates.features;
    if (updates.isPopular !== undefined || updates.is_popular !== undefined) {
      updateData.is_popular = updates.isPopular ?? updates.is_popular;
    }
    if (updates.isActive !== undefined || updates.is_active !== undefined) {
      updateData.is_active = updates.isActive ?? updates.is_active;
    }
    if (updates.sortOrder !== undefined || updates.sort_order !== undefined) {
      updateData.sort_order = updates.sortOrder ?? updates.sort_order;
    }
    updateData.updated_at = new Date().toISOString();
    updateData.photo_limit = -1;

    const { data: plan, error } = await supabase
      .from('storage_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating storage plan:', error);
      return NextResponse.json(
        { error: 'Failed to update storage plan' },
        { status: 500 }
      );
    }

    if (updateData.storage_limit_mb !== undefined) {
      const { data: activeSubscriptions } = await supabase
        .from('storage_subscriptions')
        .select('user_id')
        .eq('plan_id', id)
        .eq('status', 'active');
      const activeUserIds = Array.from(
        new Set((activeSubscriptions || []).map((row: any) => String(row.user_id || '')).filter(Boolean))
      );
      if (activeUserIds.length > 0) {
        await Promise.allSettled(
          activeUserIds.map((userId) =>
            supabase.rpc('sync_subscription_limits', { p_user_id: userId })
          )
        );
      }
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Admin update storage plan error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await isAdmin(supabase, user.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Check if plan has active subscriptions
    const { count } = await supabase
      .from('storage_subscriptions')
      .select('id', { count: 'exact' })
      .eq('plan_id', id)
      .eq('status', 'active');

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan with ${count} active subscriptions. Deactivate it instead.` },
        { status: 400 }
      );
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('storage_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error deleting storage plan:', error);
      return NextResponse.json(
        { error: 'Failed to delete storage plan' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin delete storage plan error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

