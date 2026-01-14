/**
 * Admin Storage Analytics API
 * 
 * GET - Get storage usage analytics and revenue metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Helper to check admin status
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  
  return !!data;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !(await isAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get subscription stats by plan
    const { data: subscriptionStats } = await supabase
      .from('storage_subscriptions')
      .select(`
        plan_id,
        status,
        billing_cycle,
        price_paid,
        storage_plans!inner(name, slug)
      `)
      .eq('status', 'active');

    // Calculate subscription metrics
    const planMetrics: Record<string, {
      planName: string;
      planSlug: string;
      monthlyCount: number;
      yearlyCount: number;
      totalRevenue: number;
      mrr: number;
    }> = {};

    (subscriptionStats || []).forEach((sub: any) => {
      const planId = sub.plan_id;
      if (!planMetrics[planId]) {
        planMetrics[planId] = {
          planName: sub.storage_plans.name,
          planSlug: sub.storage_plans.slug,
          monthlyCount: 0,
          yearlyCount: 0,
          totalRevenue: 0,
          mrr: 0,
        };
      }

      if (sub.billing_cycle === 'monthly') {
        planMetrics[planId].monthlyCount++;
        planMetrics[planId].mrr += sub.price_paid;
      } else {
        planMetrics[planId].yearlyCount++;
        planMetrics[planId].mrr += sub.price_paid / 12; // Normalize to monthly
      }
      planMetrics[planId].totalRevenue += sub.price_paid;
    });

    // Get total storage usage
    const { data: usageStats } = await supabase
      .from('storage_usage')
      .select('total_photos, total_size_bytes');

    let totalPhotos = 0;
    let totalStorageBytes = 0;
    let usersWithPhotos = 0;

    (usageStats || []).forEach((usage: any) => {
      totalPhotos += usage.total_photos || 0;
      totalStorageBytes += usage.total_size_bytes || 0;
      if (usage.total_photos > 0) usersWithPhotos++;
    });

    // Get recent transactions
    const { data: recentTransactions } = await supabase
      .from('storage_transactions')
      .select(`
        id,
        type,
        amount,
        currency,
        status,
        created_at,
        storage_plans(name)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    // Calculate total revenue
    const { data: revenueData } = await supabase
      .from('storage_transactions')
      .select('amount, type')
      .eq('status', 'completed');

    let totalRevenue = 0;
    let totalRefunds = 0;
    (revenueData || []).forEach((tx: any) => {
      if (tx.type === 'refund') {
        totalRefunds += tx.amount;
      } else {
        totalRevenue += tx.amount;
      }
    });

    // Calculate MRR
    const totalMrr = Object.values(planMetrics).reduce((sum, p) => sum + p.mrr, 0);

    // Get subscription counts
    const { count: activeSubscriptions } = await supabase
      .from('storage_subscriptions')
      .select('id', { count: 'exact' })
      .eq('status', 'active');

    const { count: totalUsers } = await supabase
      .from('storage_usage')
      .select('id', { count: 'exact' });

    return NextResponse.json({
      overview: {
        totalRevenue: totalRevenue - totalRefunds,
        mrr: totalMrr,
        activeSubscriptions: activeSubscriptions || 0,
        totalUsers: totalUsers || 0,
        usersWithPhotos,
        totalPhotos,
        totalStorageGb: (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2),
      },
      planMetrics: Object.values(planMetrics),
      recentTransactions: (recentTransactions || []).map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        planName: tx.storage_plans?.name,
        createdAt: tx.created_at,
      })),
    });
  } catch (error) {
    console.error('Admin storage analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
