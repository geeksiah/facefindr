export const dynamic = 'force-dynamic';

/**
 * Subscription Pricing API
 * 
 * Get subscription plan pricing in user's currency.
 * Fetches from the modular pricing system with fallback to legacy.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getSubscriptionPricing,
  getEffectiveCurrency,
  getCountryFromRequest,
  formatPrice,
} from '@/lib/currency';
import { getAllPlans, getAllPlanFeatures, PLAN_NAMES, PLAN_DESCRIPTIONS } from '@/lib/subscription';
import { createClient } from '@/lib/supabase/server';

// GET - Get subscription pricing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let currency = searchParams.get('currency');
    const planType = searchParams.get('type') as 'photographer' | 'drop_in' | null;
    
    // If no currency specified, detect from user preference or location
    if (!currency) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      const detectedCountry = getCountryFromRequest(request.headers);
      currency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);
    }
    
    // Try to get plans from new modular system first
    const modularPlans = await getAllPlans(planType || 'photographer');
    
    if (modularPlans && modularPlans.length > 0) {
      // Format plans for the billing page
      const plans = await Promise.all(modularPlans.map(async plan => {
        // Get price in requested currency
        const priceInCurrency = plan.prices[currency!] || plan.basePriceUsd;
        const annualPrice = Math.round(priceInCurrency * 10); // 10 months for annual (2 months free)
        
        return {
          planCode: plan.code,
          name: plan.name,
          description: plan.description,
          monthlyPrice: priceInCurrency,
          annualPrice: annualPrice,
          formattedMonthly: await formatPrice(priceInCurrency, currency!),
          formattedAnnual: await formatPrice(annualPrice, currency!),
          isPopular: plan.isPopular,
          displayFeatures: plan.features,
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
            // Drop-in specific
            externalSearch: plan.capabilities.externalSearch,
            contactSearch: plan.capabilities.contactSearch,
            giftEnabled: plan.capabilities.giftEnabled,
            unlimitedUploads: plan.capabilities.unlimitedUploads,
          },
        };
      }));
      
      return NextResponse.json({
        currency,
        plans,
        source: 'modular',
      });
    }
    
    // Fallback to legacy system
    const pricing = await getSubscriptionPricing(currency!);
    const features = await getAllPlanFeatures();
    
    const plans = pricing.map(p => ({
      ...p,
      name: PLAN_NAMES[p.planCode as keyof typeof PLAN_NAMES] || p.planCode,
      description: PLAN_DESCRIPTIONS[p.planCode as keyof typeof PLAN_DESCRIPTIONS] || '',
      features: features[p.planCode as keyof typeof features] || null,
    }));
    
    return NextResponse.json({
      currency,
      plans,
      source: 'legacy',
    });
    
  } catch (error) {
    console.error('Subscription pricing GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get pricing' },
      { status: 500 }
    );
  }
}

