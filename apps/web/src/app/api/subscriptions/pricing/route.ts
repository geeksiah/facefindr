export const dynamic = 'force-dynamic';

/**
 * Subscription Pricing API
 * 
 * Get subscription plan pricing in user's currency.
 * Fetches from the modular pricing system with fallback to legacy.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getEffectiveCurrency,
  getCountryFromRequest,
  formatPrice,
} from '@/lib/currency';
import { getAllPlans } from '@/lib/subscription';
import { resolvePlanPriceForCurrency } from '@/lib/subscription/price-resolution';
import { createClient } from '@/lib/supabase/server';

// GET - Get subscription pricing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let currency = searchParams.get('currency');
    const planType = searchParams.get('type') as 'creator' | 'photographer' | 'drop_in' | 'payg' | null;
    
    // If no currency specified, detect from user preference or location
    if (!currency) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      const detectedCountry = getCountryFromRequest(request.headers);
      currency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);
    }
    
    const normalizedPlanType = planType === 'photographer' ? 'creator' : planType;
    const plansFromConfig = await getAllPlans(normalizedPlanType || 'creator');
    if (!plansFromConfig || plansFromConfig.length === 0) {
      return NextResponse.json(
        {
          error: 'No active pricing plans configured in admin.',
          failClosed: true,
        },
        { status: 503 }
      );
    }

    const normalizedCurrency = String(currency || 'USD').toUpperCase();
    const plans = await Promise.all(
      plansFromConfig.map(async (plan) => {
        const resolvedPrice = await resolvePlanPriceForCurrency(plan, normalizedCurrency);
        const priceInCurrency = resolvedPrice?.amountCents ?? 0;
        const annualPrice = Math.round(priceInCurrency * 10);

        return {
          planId: plan.id,
          planCode: plan.code,
          planType: plan.planType,
          name: plan.name,
          description: plan.description,
          monthlyPrice: priceInCurrency,
          annualPrice,
          formattedMonthly: await formatPrice(priceInCurrency, normalizedCurrency),
          formattedAnnual: await formatPrice(annualPrice, normalizedCurrency),
          isPopular: plan.isPopular,
          trialEnabled: plan.trialEnabled,
          trialDurationDays: plan.trialDurationDays,
          trialFeaturePolicy: plan.trialFeaturePolicy,
          trialAutoBillEnabled: plan.trialAutoBillEnabled,
          features: {
            maxActiveEvents: plan.limits.maxActiveEvents,
            maxPhotosPerEvent: plan.limits.maxPhotosPerEvent,
            maxFaceOpsPerEvent: plan.limits.maxFaceOpsPerEvent,
            storageGb: plan.limits.storageGb,
            teamMembers: plan.limits.teamMembers,
            platformFeePercent: plan.platformFeePercent,
            customWatermark: plan.capabilities.customWatermark,
            customBranding: plan.capabilities.customBranding,
            liveEventMode: plan.capabilities.liveEventMode,
            advancedAnalytics: plan.capabilities.advancedAnalytics,
            apiAccess: plan.capabilities.apiAccess,
            prioritySupport: plan.capabilities.prioritySupport,
            whiteLabel: plan.capabilities.whiteLabel,
            printProducts: plan.capabilities.printProducts,
            externalSearch: plan.capabilities.externalSearch,
            contactSearch: plan.capabilities.contactSearch,
            giftEnabled: plan.capabilities.giftEnabled,
            unlimitedUploads: plan.capabilities.unlimitedUploads,
          },
        };
      })
    );

    return NextResponse.json({
      currency: normalizedCurrency,
      plans,
      source: 'admin-config',
    });
    
  } catch (error) {
    console.error('Subscription pricing GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get pricing' },
      { status: 500 }
    );
  }
}

