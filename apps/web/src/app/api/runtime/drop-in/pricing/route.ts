export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';
import { convertCurrency, getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency/currency-service';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const pricing = await resolveDropInPricingConfig();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const detectedCountry = getCountryFromRequest(new Headers(request.headers));
    const effectiveCurrency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);

    let uploadFeeCents = pricing.uploadFeeCents;
    let giftFeeCents = pricing.giftFeeCents;
    let currencyCode = pricing.currencyCode;

    if (effectiveCurrency && effectiveCurrency !== pricing.currencyCode) {
      uploadFeeCents = await convertCurrency(pricing.uploadFeeCents, pricing.currencyCode, effectiveCurrency);
      giftFeeCents = await convertCurrency(pricing.giftFeeCents, pricing.currencyCode, effectiveCurrency);
      currencyCode = effectiveCurrency;
    }

    return NextResponse.json({
      uploadFeeCents,
      giftFeeCents,
      currency: currencyCode,
      uploadFee: uploadFeeCents / 100,
      giftFee: giftFeeCents / 100,
      source: pricing.source,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Runtime drop-in pricing error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load drop-in pricing';
    const notConfigured = message.toLowerCase().includes('not configured');
    return NextResponse.json(
      { error: message, failClosed: true },
      { status: notConfigured ? 503 : 500 }
    );
  }
}
