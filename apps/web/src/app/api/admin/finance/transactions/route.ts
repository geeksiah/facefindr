export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

async function isAdmin(supabase: any, user: { email?: string | null }) {
  if (!user.email) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || !(await isAdmin(authClient, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0);
    const flowType = String(searchParams.get('flowType') || '').trim().toLowerCase();

    const supabase = createServiceClient();
    let query = supabase
      .from('financial_admin_activity_view')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (flowType) {
      query = query.eq('financial_flow_type', flowType);
    }

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const transactions = (data || []).map((row: any) => ({
      id: row.journal_id,
      occurredAt: row.occurred_at,
      type: row.financial_flow_type,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      currency: row.currency,
      provider: row.provider,
      description: row.description,
      creatorId: row.creator_id,
      amounts: {
        platformRevenueMinor: Number(row.platform_revenue_minor || 0),
        providerFeeMinor: Number(row.provider_fee_minor || 0),
        creatorPayableMinor: Number(row.creator_payable_minor || 0),
        attendeeCreditLiabilityMinor: Number(row.attendee_credit_liability_minor || 0),
      },
      metadata: row.metadata || {},
    }));

    return NextResponse.json({
      transactions,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Admin finance transactions GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch finance transactions' },
      { status: 500 }
    );
  }
}
