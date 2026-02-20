export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { convertCurrency, getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency';
import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';
import { createClient } from '@/lib/supabase/server';

type RuntimePack = {
  id: string;
  code: string;
  name: string;
  description: string;
  credits: number;
  priceCents: number;
  currency: string;
  popular: boolean;
};

const DEFAULT_PRESET_CREDITS = [5, 10, 25, 50];

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const detectedCountry = getCountryFromRequest(request.headers) || undefined;
    const preferredCurrency = String(
      await getEffectiveCurrency(user?.id, detectedCountry)
    ).toUpperCase();

    const config = await resolveDropInPricingConfig();
    let unitPriceCents = config.creditUnitCents;
    let currency = config.currencyCode;

    if (preferredCurrency && preferredCurrency !== config.currencyCode) {
      unitPriceCents = await convertCurrency(config.creditUnitCents, config.currencyCode, preferredCurrency);
      currency = preferredCurrency;
    }

    if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
      return NextResponse.json(
        {
          error: 'Drop-in credit pricing is not configured in admin settings.',
          failClosed: true,
          packs: [],
        },
        { status: 503 }
      );
    }

    const packs: RuntimePack[] = DEFAULT_PRESET_CREDITS.map((credits, index) => ({
      id: `preset-${credits}`,
      code: `credits_${credits}`,
      name: `${credits} Credits`,
      description: `${credits} drop-in credits`,
      credits,
      priceCents: Math.round(unitPriceCents * credits),
      currency,
      popular: index === 1,
    }));

    return NextResponse.json({
      packs,
      currency,
      unitPriceCents,
      unitPrice: unitPriceCents / 100,
      allowCustom: true,
      minCredits: 1,
      maxCredits: 1000,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime drop-in packs error:', error);
    return NextResponse.json(
      {
        error: 'Failed to load drop-in credit pricing',
        failClosed: true,
        packs: [],
      },
      { status: 500 }
    );
  }
}

