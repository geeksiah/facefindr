export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

import { resolveDropInPricingConfig } from '@/lib/drop-in/pricing';

export async function GET() {
  try {
    const pricing = await resolveDropInPricingConfig();

    return NextResponse.json({
      uploadFeeCents: pricing.uploadFeeCents,
      giftFeeCents: pricing.giftFeeCents,
      currency: pricing.currencyCode,
      uploadFee: pricing.uploadFeeCents / 100,
      giftFee: pricing.giftFeeCents / 100,
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
