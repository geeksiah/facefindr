export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { getAvailableDropInCredits } from '@/lib/drop-in/credits';
import { resolveDropInCreditRules } from '@/lib/drop-in/credit-rules';
import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';
import { convertCurrency, getCountryFromRequest, getEffectiveCurrency } from '@/lib/currency/currency-service';
import { resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const [pricing, rules] = await Promise.all([
      resolveDropInPricingConfig(),
      resolveDropInCreditRules(),
    ]);
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const detectedCountry = getCountryFromRequest(new Headers(request.headers));
    const effectiveCurrency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);

    let uploadFeeCents = pricing.uploadFeeCents;
    let currencyCode = pricing.currencyCode;

    if (effectiveCurrency && effectiveCurrency !== pricing.currencyCode) {
      uploadFeeCents = await convertCurrency(pricing.uploadFeeCents, pricing.currencyCode, effectiveCurrency);
      currencyCode = effectiveCurrency;
    }

    let attendeeCredits = 0;
    if (user?.id) {
      const serviceClient = createServiceClient();
      const { data: attendee } = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
      if (attendee?.id) {
        attendeeCredits = await getAvailableDropInCredits(serviceClient, attendee.id);
      }
    }

    const uploadCreditsRequired = rules.upload;
    const giftCreditsRequired = rules.gift;
    const uploadFeeFromCreditsCents = Math.round(uploadCreditsRequired * uploadFeeCents);
    const giftFeeFromCreditsCents = Math.round(giftCreditsRequired * uploadFeeCents);

    return NextResponse.json({
      attendeeCredits,
      creditUnitCents: uploadFeeCents,
      currency: currencyCode,
      creditUnit: uploadFeeCents / 100,
      uploadCreditsRequired,
      giftCreditsRequired,
      searchInternalCreditsRequired: rules.internalSearch,
      searchContactsCreditsRequired: rules.contactsSearch,
      searchExternalCreditsRequired: rules.externalSearch,
      recipientUnlockCreditsRequired: rules.recipientUnlock,
      // Backward-compatible fields for older clients
      uploadFeeCents: uploadFeeFromCreditsCents,
      giftFeeCents: giftFeeFromCreditsCents,
      uploadFee: uploadFeeFromCreditsCents / 100,
      giftFee: giftFeeFromCreditsCents / 100,
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
