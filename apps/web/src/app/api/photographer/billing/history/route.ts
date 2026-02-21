export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient, createServiceClient } from '@/lib/supabase/server';

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceClient = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: creatorProfile } = await resolvePhotographerProfileByUser(
      serviceClient,
      user.id,
      user.email
    );
    const creatorId = creatorProfile?.id || user.id;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);

    const { data, error } = await serviceClient
      .from('financial_admin_activity_view')
      .select('*')
      .eq('creator_id', creatorId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    const history = (data || []).map((row: any) => {
      const creatorMinor = toNumber(row.creator_payable_minor);
      const revenueMinor = toNumber(row.platform_revenue_minor);
      const creditLiabilityMinor = toNumber(row.attendee_credit_liability_minor);
      const providerFeeMinor = toNumber(row.provider_fee_minor);
      const signedAmountMinor =
        creatorMinor !== 0
          ? creatorMinor
          : revenueMinor !== 0
            ? revenueMinor
            : creditLiabilityMinor !== 0
              ? creditLiabilityMinor
              : 0;

      return {
        id: row.journal_id,
        occurredAt: row.occurred_at,
        type: row.financial_flow_type,
        sourceKind: row.source_kind,
        sourceId: row.source_id,
        provider: row.provider,
        currency: row.currency,
        description: row.description,
        amountMinor: signedAmountMinor,
        providerFeeMinor,
        metadata: row.metadata || {},
      };
    });

    return NextResponse.json({
      history,
      count: history.length,
    });
  } catch (error) {
    console.error('Creator billing history GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing history' },
      { status: 500 }
    );
  }
}
