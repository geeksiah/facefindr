export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { convertCurrency, getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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

function readAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const preferredCurrency = String(
      await getEffectiveCurrency(user?.id, detectedCountry)
    ).toUpperCase();

    const { data, error } = await supabase
      .from('subscription_plans')
      .select('id, code, name, description, plan_type, is_active, is_popular, base_price_usd, prices, features')
      .eq('plan_type', 'drop_in')
      .eq('is_active', true)
      .order('base_price_usd', { ascending: true });

    if (error || !data) {
      throw error || new Error('Missing drop-in plan configuration');
    }

    const packs: Promise<RuntimePack>[] = (data as any[])
      .map(async (plan) => {
        const prices = (plan.prices || {}) as Record<string, unknown>;
        const directPreferred = readAmount(prices[preferredCurrency]);
        const usdPrice = readAmount(prices.USD) ?? readAmount(plan.base_price_usd) ?? 0;
        let priceCents = directPreferred ?? usdPrice;
        let currency = directPreferred ? preferredCurrency : 'USD';

        if (!directPreferred && usdPrice > 0 && preferredCurrency !== 'USD') {
          const converted = await convertCurrency(Math.round(usdPrice), 'USD', preferredCurrency);
          if (Number.isFinite(converted) && converted > 0) {
            priceCents = converted;
            currency = preferredCurrency;
          }
        }

        return {
          id: String(plan.id),
          code: String(plan.code || ''),
          name: String(plan.name || ''),
          description: String(plan.description || ''),
          priceCents: Number.isFinite(priceCents) ? Math.round(priceCents) : 0,
          currency,
          features: Array.isArray(plan.features) ? plan.features.filter((f: unknown) => typeof f === 'string') : [],
          popular: Boolean(plan.is_popular),
        } as RuntimePack;
      });

    const resolvedPacks = await Promise.all(packs);
    const filteredPacks = resolvedPacks
      .filter((plan) => plan.code && plan.priceCents > 0 && plan.code !== 'free');

    if (filteredPacks.length === 0) {
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
      packs: filteredPacks,
      currency: preferredCurrency,
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
