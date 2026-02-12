export const dynamic = 'force-dynamic';

/**
 * Cart API
 * 
 * Manages shopping cart for photo purchases.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getCart, addToCart, removeFromCart, clearCart, getCartTotal } from '@/lib/delivery';
import { createClient } from '@/lib/supabase/server';

// GET - Get cart contents
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cart = await getCart(user.id);
    const totals = await getCartTotal(user.id);

    return NextResponse.json({
      items: cart,
      subtotal: totals.subtotal,
      itemCount: totals.itemCount,
    });

  } catch (error) {
    console.error('Cart GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get cart' },
      { status: 500 }
    );
  }
}

// POST - Add item to cart
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventId, digitalProductId, mediaId } = body;

    if (!eventId || !digitalProductId) {
      return NextResponse.json(
        { error: 'Event ID and product ID are required' },
        { status: 400 }
      );
    }

    const result = await addToCart(user.id, eventId, digitalProductId, mediaId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Return updated cart
    const cart = await getCart(user.id);
    const totals = await getCartTotal(user.id);

    return NextResponse.json({
      success: true,
      cartItemId: result.cartItemId,
      items: cart,
      subtotal: totals.subtotal,
      itemCount: totals.itemCount,
    });

  } catch (error) {
    console.error('Cart POST error:', error);
    return NextResponse.json(
      { error: 'Failed to add to cart' },
      { status: 500 }
    );
  }
}

// DELETE - Remove item from cart or clear cart
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cartItemId = searchParams.get('itemId');
    const clearAll = searchParams.get('clear') === 'true';

    if (clearAll) {
      await clearCart(user.id);
    } else if (cartItemId) {
      const result = await removeFromCart(user.id, cartItemId);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Item ID or clear flag required' },
        { status: 400 }
      );
    }

    // Return updated cart
    const cart = await getCart(user.id);
    const totals = await getCartTotal(user.id);

    return NextResponse.json({
      success: true,
      items: cart,
      subtotal: totals.subtotal,
      itemCount: totals.itemCount,
    });

  } catch (error) {
    console.error('Cart DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to update cart' },
      { status: 500 }
    );
  }
}

