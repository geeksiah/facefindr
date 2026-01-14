/**
 * Digital Products API
 * 
 * Get available digital products and their pricing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDigitalProducts, getEventPricing } from '@/lib/delivery';

// GET - Get digital products with optional event-specific pricing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    // Get all products
    const products = await getDigitalProducts();

    // If event ID provided, get event-specific pricing
    if (eventId) {
      const eventPricing = await getEventPricing(eventId);
      
      // Apply event-specific prices
      const productsWithPricing = products.map(product => ({
        ...product,
        price: eventPricing.get(product.id) ?? product.defaultPrice,
        hasCustomPrice: eventPricing.has(product.id),
      }));

      return NextResponse.json({ products: productsWithPricing });
    }

    // Return products with default pricing
    const productsWithPricing = products.map(product => ({
      ...product,
      price: product.defaultPrice,
      hasCustomPrice: false,
    }));

    return NextResponse.json({ products: productsWithPricing });

  } catch (error) {
    console.error('Digital products GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get products' },
      { status: 500 }
    );
  }
}
