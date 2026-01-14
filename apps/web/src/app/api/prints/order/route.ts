import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { createClient, createServiceClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// ============================================
// PRINT ORDER API
// SRS §7.4: Print product ordering
// ============================================

interface OrderItem {
  productId: string;
  productName: string;
  productSize: string;
  mediaId: string;
  photoUrl: string;
  quantity: number;
  unitPrice: number; // In cents
}

interface ShippingAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
  shippingCost?: number;
}

/**
 * POST - Create a new print order
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { items, shipping, saveAddress } = body as {
      items: OrderItem[];
      shipping: ShippingAddress;
      saveAddress?: boolean;
    };

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item required' }, { status: 400 });
    }

    // Validate shipping
    if (!shipping || !shipping.name || !shipping.addressLine1 || !shipping.city || !shipping.postalCode || !shipping.country) {
      return NextResponse.json({ error: 'Complete shipping address required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const shippingCost = shipping.shippingCost || 0;
    const total = subtotal + shippingCost;

    // Create order using database function
    const { data: orderId, error: createError } = await serviceClient
      .rpc('create_print_order', {
        p_customer_id: user.id,
        p_customer_email: user.email!,
        p_customer_name: shipping.name,
        p_shipping: {
          name: shipping.name,
          address_line1: shipping.addressLine1,
          address_line2: shipping.addressLine2 || null,
          city: shipping.city,
          state: shipping.state || null,
          postal_code: shipping.postalCode,
          country: shipping.country,
          shipping_cost: shippingCost,
        },
        p_items: items.map(item => ({
          product_id: item.productId,
          product_name: item.productName,
          product_size: item.productSize,
          media_id: item.mediaId,
          photo_url: item.photoUrl,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
        p_currency: 'USD',
      });

    if (createError || !orderId) {
      console.error('Create order error:', createError);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    // Get the order to retrieve order number
    const { data: order } = await serviceClient
      .from('print_orders')
      .select('order_number')
      .eq('id', orderId)
      .single();

    // Create Stripe Checkout Session
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${item.productName} - ${item.productSize}`,
          images: [item.photoUrl],
        },
        unit_amount: item.unitPrice,
      },
      quantity: item.quantity,
    }));

    // Add shipping as line item
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Shipping',
            images: [],
          },
          unit_amount: shippingCost,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: user.email!,
      metadata: {
        order_id: orderId,
        order_number: order?.order_number || '',
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/prints/success?order=${orderId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/prints/cart`,
    });

    // Update order with Stripe session ID
    await serviceClient
      .from('print_orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', orderId);

    // Optionally save shipping address
    if (saveAddress) {
      await serviceClient
        .from('shipping_addresses')
        .upsert({
          user_id: user.id,
          name: shipping.name,
          address_line1: shipping.addressLine1,
          address_line2: shipping.addressLine2 || null,
          city: shipping.city,
          state: shipping.state || null,
          postal_code: shipping.postalCode,
          country: shipping.country,
          phone: shipping.phone || null,
          is_default: true,
        }, {
          onConflict: 'user_id',
        });
    }

    return NextResponse.json({
      success: true,
      orderId,
      orderNumber: order?.order_number,
      checkoutUrl: session.url,
      total: {
        subtotal,
        shipping: shippingCost,
        total,
        currency: 'USD',
      },
    });

  } catch (error) {
    console.error('Create print order error:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

/**
 * GET - List user's print orders
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const serviceClient = createServiceClient();

    let query = serviceClient
      .from('print_orders')
      .select(`
        *,
        print_order_items(*)
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error, count } = await query;

    if (error) {
      console.error('Fetch orders error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orders: orders || [],
      total: count || orders?.length || 0,
      limit,
      offset,
    });

  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'Failed to get orders' },
      { status: 500 }
    );
  }
}
