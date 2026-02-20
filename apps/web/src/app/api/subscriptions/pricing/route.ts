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

    const plans = await Promise.all(
      plansFromConfig.map(async (plan) => {
        const priceInCurrency = plan.prices[currency!] ?? plan.basePriceUsd;
        const annualPrice = Math.round(priceInCurrency * 10);

        return {
          planId: plan.id,
          planCode: plan.code,
          planType: plan.planType,
          name: plan.name,
          description: plan.description,
          monthlyPrice: priceInCurrency,
          annualPrice,
          formattedMonthly: await formatPrice(priceInCurrency, currency!),
          formattedAnnual: await formatPrice(annualPrice, currency!),
          isPopular: plan.isPopular,
          displayFeatures: plan.features, // Optional marketing highlights only
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
      currency,
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

