export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/server';

type RuntimePack = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  features: string[];
  popular: boolean;
};

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('id, code, name, description, plan_type, is_active, is_popular, base_price_usd, prices, features')
      .eq('plan_type', 'drop_in')
      .eq('is_active', true)
      .order('base_price_usd', { ascending: true });

    if (error || !data) {
      throw error || new Error('Missing drop-in plan configuration');
    }

    const packs: RuntimePack[] = (data as any[])
      .map((plan) => {
        const prices = (plan.prices || {}) as Record<string, number>;
        const usdPrice = Number(prices.USD ?? plan.base_price_usd ?? 0);
        return {
          id: String(plan.id),
          code: String(plan.code || ''),
          name: String(plan.name || ''),
          description: String(plan.description || ''),
          priceCents: Number.isFinite(usdPrice) ? Math.round(usdPrice) : 0,
          currency: 'USD',
          features: Array.isArray(plan.features) ? plan.features.filter((f: unknown) => typeof f === 'string') : [],
          popular: Boolean(plan.is_popular),
        } as RuntimePack;
      })
      .filter((plan) => plan.code && plan.priceCents > 0 && plan.code !== 'free');

    if (packs.length === 0) {
      return NextResponse.json(
        {
          error: 'Drop-in packs are not configured in admin pricing.',
          failClosed: true,
          packs: [],
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      packs,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime drop-in packs error:', error);
    return NextResponse.json(
      {
        error: 'Failed to load drop-in packs',
        failClosed: true,
        packs: [],
      },
      { status: 500 }
    );
  }
}
