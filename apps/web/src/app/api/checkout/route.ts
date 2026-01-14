import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import {
  createCheckoutSession,
  isStripeConfigured,
} from '@/lib/payments/stripe';
import {
  initializePayment,
  isFlutterwaveConfigured,
} from '@/lib/payments/flutterwave';
import {
  createOrder,
  getApprovalUrl,
  isPayPalConfigured,
} from '@/lib/payments/paypal';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const {
      eventId,
      mediaIds,
      unlockAll,
      provider,
      currency = 'USD',
      customerEmail,
    } = body;

    // Validate event exists and get pricing
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        *,
        event_pricing (*),
        photographers!inner (
          id,
          display_name,
          business_name
        )
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const pricing = event.event_pricing;
    if (!pricing || pricing.is_free) {
      return NextResponse.json(
        { error: 'This event does not have paid photos' },
        { status: 400 }
      );
    }

    // Get photographer's wallet for this provider
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('photographer_id', event.photographer_id)
      .eq('provider', provider)
      .eq('status', 'active')
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Photographer has not set up payments for this method' },
        { status: 400 }
      );
    }

    // Calculate totals
    let items: Array<{
      name: string;
      description?: string;
      amount: number;
      quantity: number;
      mediaIds?: string[];
    }> = [];

    if (unlockAll) {
      // Unlock all photos in event
      items.push({
        name: `All Photos - ${event.name}`,
        description: 'Unlock all photos from this event',
        amount: pricing.unlock_all_price,
        quantity: 1,
      });
    } else if (mediaIds && mediaIds.length > 0) {
      // Individual photos
      items.push({
        name: `${mediaIds.length} Photo${mediaIds.length > 1 ? 's' : ''} - ${event.name}`,
        description: `Selected photos from ${event.name}`,
        amount: pricing.price_per_media,
        quantity: mediaIds.length,
        mediaIds,
      });
    } else {
      return NextResponse.json(
        { error: 'No photos selected' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const txRef = uuidv4();

    // Determine customer email
    const email = customerEmail || user?.email;

    let checkoutUrl: string;
    let sessionId: string;

    // Handle Stripe
    if (provider === 'stripe') {
      if (!isStripeConfigured() || !wallet.stripe_account_id) {
        return NextResponse.json(
          { error: 'Stripe is not configured' },
          { status: 500 }
        );
      }

      const session = await createCheckoutSession({
        photographerAccountId: wallet.stripe_account_id,
        eventId,
        eventName: event.name,
        items,
        currency,
        customerEmail: email,
        successUrl: `${baseUrl}/gallery/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/gallery/events/${eventId}?checkout=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
        },
      });

      checkoutUrl = session.url!;
      sessionId = session.id;
    }
    // Handle Flutterwave
    else if (provider === 'flutterwave') {
      if (!isFlutterwaveConfigured() || !wallet.flutterwave_subaccount_id) {
        return NextResponse.json(
          { error: 'Flutterwave is not configured' },
          { status: 500 }
        );
      }

      const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);

      const payment = await initializePayment({
        txRef,
        amount: totalAmount,
        currency,
        redirectUrl: `${baseUrl}/gallery/checkout/success?tx_ref=${txRef}&provider=flutterwave`,
        customerEmail: email || '',
        eventId,
        eventName: event.name,
        photographerSubaccountId: wallet.flutterwave_subaccount_id,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
        },
      });

      checkoutUrl = payment.link;
      sessionId = txRef;
    }
    // Handle PayPal
    else if (provider === 'paypal') {
      if (!isPayPalConfigured() || !wallet.paypal_merchant_id) {
        return NextResponse.json(
          { error: 'PayPal is not configured' },
          { status: 500 }
        );
      }

      const order = await createOrder({
        eventId,
        eventName: event.name,
        items,
        currency,
        photographerPayPalEmail: wallet.paypal_merchant_id,
        returnUrl: `${baseUrl}/gallery/checkout/success?order_id=${txRef}&provider=paypal`,
        cancelUrl: `${baseUrl}/gallery/events/${eventId}?checkout=cancelled`,
        metadata: {
          wallet_id: wallet.id,
          media_ids: mediaIds?.join(',') || 'all',
          unlock_all: String(unlockAll || false),
          attendee_id: user?.id || '',
          tx_ref: txRef,
        },
      });

      const approvalUrl = getApprovalUrl(order);
      if (!approvalUrl) {
        return NextResponse.json(
          { error: 'Failed to get PayPal approval URL' },
          { status: 500 }
        );
      }

      checkoutUrl = approvalUrl;
      sessionId = order.id;
    } else {
      return NextResponse.json(
        { error: 'Invalid payment provider' },
        { status: 400 }
      );
    }

    // Create pending transaction record
    const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    const platformFee = Math.round(totalAmount * 0.15);
    const providerFee = Math.round(totalAmount * 0.029 + 30); // Approximate
    const netAmount = totalAmount - platformFee - providerFee;

    await supabase.from('transactions').insert({
      event_id: eventId,
      wallet_id: wallet.id,
      attendee_id: user?.id || null,
      attendee_email: email,
      payment_provider: provider,
      stripe_payment_intent_id: provider === 'stripe' ? null : null, // Will be filled by webhook
      stripe_checkout_session_id: provider === 'stripe' ? sessionId : null,
      flutterwave_tx_ref: provider === 'flutterwave' ? txRef : null,
      paypal_order_id: provider === 'paypal' ? sessionId : null,
      gross_amount: totalAmount,
      platform_fee: platformFee,
      stripe_fee: providerFee,
      provider_fee: providerFee,
      net_amount: netAmount,
      currency,
      status: 'pending',
      metadata: {
        items,
        media_ids: mediaIds || [],
        unlock_all: unlockAll || false,
      },
    });

    return NextResponse.json({
      checkoutUrl,
      sessionId,
      provider,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
