export const dynamic = 'force-dynamic';

/**
 * Digital Products API
 * 
 * Get available digital products and their pricing.
 * Supports multi-currency display.
 */

import { NextRequest, NextResponse } from 'next/server';

import { 
  getEffectiveCurrency, 
  getCountryFromRequest,
  convertCurrency,
  formatPrice,
  getCurrency,
} from '@/lib/currency';
import { getDigitalProducts, getEventPricing } from '@/lib/delivery';
import { createClient } from '@/lib/supabase/server';

// GET - Get digital products with optional event-specific pricing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    let displayCurrency = searchParams.get('currency');

    // Detect user's currency if not specified
    if (!displayCurrency) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const detectedCountry = getCountryFromRequest(request.headers);
      displayCurrency = await getEffectiveCurrency(user?.id, detectedCountry || undefined);
    }

    // Get all products
    const products = await getDigitalProducts();
    
    // Get event currency if event specified
    let eventCurrency = 'USD';
    if (eventId) {
      const supabase = await createClient();
      const { data: event } = await supabase
        .from('events')
        .select('currency')
        .eq('id', eventId)
        .single();
      
      if (event?.currency) {
        eventCurrency = event.currency;
      }
    }

    // If event ID provided, get event-specific pricing
    let productsWithPricing;
    
    if (eventId) {
      const eventPricing = await getEventPricing(eventId);
      
      // Apply event-specific prices and convert currency
      productsWithPricing = await Promise.all(products.map(async product => {
        const priceInEventCurrency = eventPricing.get(product.id) ?? product.defaultPrice;
        const priceInDisplayCurrency = await convertCurrency(
          priceInEventCurrency,
          eventCurrency,
          displayCurrency!
        );
        
        return {
          ...product,
          price: priceInDisplayCurrency,
          originalPrice: priceInEventCurrency,
          originalCurrency: eventCurrency,
          currency: displayCurrency,
          formattedPrice: await formatPrice(priceInDisplayCurrency, displayCurrency!),
          hasCustomPrice: eventPricing.has(product.id),
        };
      }));
    } else {
      // Return products with default pricing (USD), converted to display currency
      productsWithPricing = await Promise.all(products.map(async product => {
        const priceInDisplayCurrency = await convertCurrency(
          product.defaultPrice,
          'USD',
          displayCurrency!
        );
        
        return {
          ...product,
          price: priceInDisplayCurrency,
          originalPrice: product.defaultPrice,
          originalCurrency: 'USD',
          currency: displayCurrency,
          formattedPrice: await formatPrice(priceInDisplayCurrency, displayCurrency!),
          hasCustomPrice: false,
        };
      }));
    }

    // Get currency info for display
    const currencyInfo = await getCurrency(displayCurrency!);

    return NextResponse.json({ 
      products: productsWithPricing,
      currency: displayCurrency,
      currencyInfo,
      eventCurrency: eventId ? eventCurrency : null,
    });

  } catch (error) {
    console.error('Digital products GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get products' },
      { status: 500 }
    );
  }
}

