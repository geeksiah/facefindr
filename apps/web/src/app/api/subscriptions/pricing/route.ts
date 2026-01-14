/**
 * Subscription Pricing API
 * 
 * Get subscription plan pricing in user's currency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSubscriptionPricing,
  getEffectiveCurrency,
  getCountryFromRequest,
} from '@/lib/currency';
import { getAllPlanFeatures, PLAN_NAMES, PLAN_DESCRIPTIONS } from '@/lib/subscription';

// GET - Get subscription pricing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let currency = searchParams.get('currency');
    
    // If no currency specified, detect from user preference or location
    if (!currency) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      const detectedCountry = getCountryFromRequest(request.headers);
      currency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);
    }
    
    // Get pricing for currency
    const pricing = await getSubscriptionPricing(currency);
    
    // Get plan features
    const features = await getAllPlanFeatures();
    
    // Combine pricing with features
    const plans = pricing.map(p => ({
      ...p,
      name: PLAN_NAMES[p.planCode as keyof typeof PLAN_NAMES] || p.planCode,
      description: PLAN_DESCRIPTIONS[p.planCode as keyof typeof PLAN_DESCRIPTIONS] || '',
      features: features[p.planCode as keyof typeof features] || null,
    }));
    
    return NextResponse.json({
      currency,
      plans,
    });
    
  } catch (error) {
    console.error('Subscription pricing GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get pricing' },
      { status: 500 }
    );
  }
}
