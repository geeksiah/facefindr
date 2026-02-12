export const dynamic = 'force-dynamic';

/**
 * Drop-In Payment Webhook
 * 
 * Handles payment webhook events for drop-in photo payments
 * Supports: Stripe, Flutterwave, PayPal
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { stripe } from '@/lib/payments/stripe';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe client not configured' }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.metadata?.type === 'drop_in_upload') {
        const attendeeId = session.metadata.attendee_id;
        const dropInPhotoId = session.metadata.drop_in_photo_id;
        const includeGift = session.metadata.include_gift === 'true';

        // Find drop-in photo by ID from metadata
        const { data: dropInPhoto } = await supabase
          .from('drop_in_photos')
          .select('*')
          .eq('id', dropInPhotoId)
          .eq('uploader_id', attendeeId)
          .eq('upload_payment_status', 'pending')
          .single();

        if (dropInPhoto) {
          // Update payment status
          await supabase
            .from('drop_in_photos')
            .update({
              upload_payment_status: 'paid',
              upload_payment_transaction_id: session.id,
              ...(includeGift && {
                gift_payment_status: 'paid',
                gift_payment_transaction_id: session.id,
              }),
            })
            .eq('id', dropInPhoto.id);

          // Trigger face processing
          // In production, this would trigger a background job
          // For now, we'll call the process API directly
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const processResponse = await fetch(`${baseUrl}/api/drop-in/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dropInPhotoId: dropInPhoto.id }),
            });
            
            if (!processResponse.ok) {
              console.error('Processing failed:', await processResponse.text());
              // Don't fail the webhook - processing can be retried manually
            }
          } catch (error) {
            console.error('Failed to trigger processing:', error);
            // Don't fail the webhook - processing can be retried
          }
        }
      }
    }

    // Handle payment_intent.succeeded (fallback)
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      if (paymentIntent.metadata?.type === 'drop_in_upload') {
        const attendeeId = paymentIntent.metadata.attendee_id;
        const dropInPhotoId = paymentIntent.metadata.drop_in_photo_id;
        const includeGift = paymentIntent.metadata.include_gift === 'true';

        const { data: dropInPhoto } = await supabase
          .from('drop_in_photos')
          .select('*')
          .eq('id', dropInPhotoId)
          .eq('uploader_id', attendeeId)
          .eq('upload_payment_status', 'pending')
          .single();

        if (dropInPhoto) {
          await supabase
            .from('drop_in_photos')
            .update({
              upload_payment_status: 'paid',
              upload_payment_transaction_id: paymentIntent.id,
              ...(includeGift && {
                gift_payment_status: 'paid',
                gift_payment_transaction_id: paymentIntent.id,
              }),
            })
            .eq('id', dropInPhoto.id);

          // Trigger processing
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            await fetch(`${baseUrl}/api/drop-in/process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dropInPhotoId: dropInPhoto.id }),
            });
          } catch (error) {
            console.error('Failed to trigger processing:', error);
          }
        }
      }
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

