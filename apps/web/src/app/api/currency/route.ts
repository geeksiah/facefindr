/**
 * Currency API
 * 
 * Get supported currencies and user preferences.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  getSupportedCurrencies,
  getUserCurrencyPreference,
  setUserCurrencyPreference,
  getEffectiveCurrency,
  getCurrencyForCountry,
  getCountryFromRequest,
  setDetectedLocation,
} from '@/lib/currency';
import { createClient } from '@/lib/supabase/server';

// GET - Get currencies and user preference
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Get supported currencies
    const currencies = await getSupportedCurrencies();
    const currencyList = Array.from(currencies.values());
    
    // Detect country from request
    const detectedCountry = getCountryFromRequest(request.headers);
    const detectedCurrency = detectedCountry 
      ? await getCurrencyForCountry(detectedCountry)
      : 'USD';
    
    // If logged in, update detected location and get preference
    let preference: Awaited<ReturnType<typeof getUserCurrencyPreference>> | null = null;
    let effectiveCurrency = detectedCurrency;
    
    if (user) {
      if (detectedCountry) {
        await setDetectedLocation(user.id, detectedCountry);
      }
      
      preference = await getUserCurrencyPreference(user.id);
      effectiveCurrency = await getEffectiveCurrency(user.id, detectedCountry || undefined);
    }
    
    return NextResponse.json({
      currencies: currencyList,
      detectedCountry,
      detectedCurrency,
      preference,
      effectiveCurrency,
    });
    
  } catch (error) {
    console.error('Currency GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get currencies' },
      { status: 500 }
    );
  }
}

// POST - Set user currency preference
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { currency } = body;
    
    if (!currency) {
      return NextResponse.json(
        { error: 'Currency code is required' },
        { status: 400 }
      );
    }
    
    // Validate currency
    const currencies = await getSupportedCurrencies();
    if (!currencies.has(currency)) {
      return NextResponse.json(
        { error: 'Unsupported currency' },
        { status: 400 }
      );
    }
    
    const result = await setUserCurrencyPreference(user.id, currency);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }
    
    return NextResponse.json({
      success: true,
      effectiveCurrency: currency,
    });
    
  } catch (error) {
    console.error('Currency POST error:', error);
    return NextResponse.json(
      { error: 'Failed to set currency' },
      { status: 500 }
    );
  }
}
