export const dynamic = 'force-dynamic';

/**
 * Drop-In Photo Upload API
 * 
 * Allows users to upload photos of people outside their contacts
 * Requires payment for discoverability and optional gift payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { isFlutterwaveConfigured, initializePayment } from '@/lib/payments/flutterwave';
import { selectPaymentGateway } from '@/lib/payments/gateway-selector';
import { isPayPalConfigured, createOrder, getApprovalUrl } from '@/lib/payments/paypal';
import { stripe } from '@/lib/payments/stripe';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

// Pricing constants (in cents)
const DROP_IN_UPLOAD_FEE = 299; // $2.99
const DROP_IN_GIFT_FEE = 499; // $4.99 (covers recipient access + unlocks message)

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const supabase = accessToken
      ? createClientWithAccessToken(accessToken)
      : await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get attendee profile
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!attendee) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('photo') as File;
    const giftMessage = formData.get('giftMessage') as string | null;
    const includeGift = formData.get('includeGift') === 'true';
    const locationLat = formData.get('locationLat') ? parseFloat(formData.get('locationLat') as string) : null;
    const locationLng = formData.get('locationLng') ? parseFloat(formData.get('locationLng') as string) : null;
    const locationName = formData.get('locationName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // Validate gift message length
    if (includeGift && giftMessage && giftMessage.length > 200) {
      return NextResponse.json({ error: 'Gift message must be 200 characters or less' }, { status: 400 });
    }

    // Check user's subscription/plan
    const { data: subscription } = await supabase
      .from('attendee_subscriptions')
      .select('plan_code, status, can_upload_drop_ins')
      .eq('attendee_id', attendee.id)
      .eq('status', 'active')
      .single();

    // Free users cannot upload drop-ins (must pay per upload)
    // Premium users get 1 free upload per month, then pay per upload

    // Generate unique filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `drop-in-${timestamp}-${randomStr}.${ext}`;
    const storagePath = `drop-ins/${attendee.id}/${filename}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Create drop-in photo record first (pending payment)
    const { data: dropInPhoto, error: dbError } = await supabase
      .from('drop_in_photos')
      .insert({
        uploader_id: attendee.id,
        storage_path: storagePath,
        original_filename: file.name,
        file_size: file.size,
        is_discoverable: false, // Will be set to true after payment
        discovery_scope: 'app_only', // MVP: app only, expand later
        upload_payment_status: 'pending',
        upload_payment_amount: DROP_IN_UPLOAD_FEE,
        is_gifted: includeGift,
        gift_payment_status: includeGift ? 'pending' : null,
        gift_payment_amount: includeGift ? DROP_IN_GIFT_FEE : null,
        gift_message: includeGift && giftMessage ? giftMessage : null,
        location_lat: locationLat,
        location_lng: locationLng,
        location_name: locationName,
        face_processing_status: 'pending',
      })
      .select()
      .single();

    if (dbError || !dropInPhoto) {
      // Clean up uploaded file
      await supabase.storage.from('media').remove([storagePath]);
      return NextResponse.json(
        { error: 'Failed to create drop-in record' },
        { status: 500 }
      );
    }

    // Select payment gateway based on user preference and country
    const gatewaySelection = await selectPaymentGateway({
      userId: attendee.id,
      currency: 'usd', // Drop-in fees are fixed in USD
    });

    // Create payment intent/checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const idempotencyKey = uuidv4();
    const selectedGateway = gatewaySelection.gateway;

    let checkoutUrl: string;
    let sessionId: string;

    try {
      // Handle Stripe
      if (selectedGateway === 'stripe') {
        if (!stripe) {
          throw new Error('Stripe is not configured');
        }

        const session = await stripe.checkout.sessions.create({
          customer_email: user.email || undefined,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Drop-In Photo Upload',
                  description: 'Make your photo discoverable by premium users',
                },
                unit_amount: DROP_IN_UPLOAD_FEE,
              },
              quantity: 1,
            },
            ...(includeGift ? [{
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Gift Access + Message',
                  description: 'Cover recipient access fee and unlock message',
                },
                unit_amount: DROP_IN_GIFT_FEE,
              },
              quantity: 1,
            }] : []),
          ],
          mode: 'payment',
          success_url: `${baseUrl}/drop-in/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/drop-in/upload?canceled=true`,
          metadata: {
            type: 'drop_in_upload',
            attendee_id: attendee.id,
            include_gift: includeGift.toString(),
            drop_in_photo_id: dropInPhoto.id,
          },
        });

        checkoutUrl = session.url!;
        sessionId = session.id;
      }
      // Handle Flutterwave
      else if (selectedGateway === 'flutterwave') {
        if (!isFlutterwaveConfigured()) {
          throw new Error('Flutterwave is not configured');
        }

        const totalAmount = DROP_IN_UPLOAD_FEE + (includeGift ? DROP_IN_GIFT_FEE : 0);
        const payment = await initializePayment({
          txRef: idempotencyKey,
          amount: totalAmount,
          currency: 'USD',
          redirectUrl: `${baseUrl}/drop-in/success?tx_ref=${idempotencyKey}&provider=flutterwave`,
          customerEmail: user.email || '',
          eventId: null, // Drop-in not tied to event
          eventName: 'Drop-In Photo Upload',
          photographerId: null, // Platform payment
          metadata: {
            type: 'drop_in_upload',
            attendee_id: attendee.id,
            include_gift: includeGift.toString(),
            drop_in_photo_id: dropInPhoto.id,
          },
        });

        checkoutUrl = payment.link;
        sessionId = idempotencyKey;
      }
      // Handle PayPal
      else if (selectedGateway === 'paypal') {
        if (!isPayPalConfigured()) {
          throw new Error('PayPal is not configured');
        }

        const order = await createOrder({
          eventId: null,
          eventName: 'Drop-In Photo Upload',
          items: [
            {
              name: 'Drop-In Photo Upload',
              description: 'Make your photo discoverable by premium users',
              amount: DROP_IN_UPLOAD_FEE,
              quantity: 1,
            },
            ...(includeGift ? [{
              name: 'Gift Access + Message',
              description: 'Cover recipient access fee and unlock message',
              amount: DROP_IN_GIFT_FEE,
              quantity: 1,
            }] : []),
          ],
          currency: 'USD',
          photographerPayPalEmail: null, // Platform payment
          returnUrl: `${baseUrl}/drop-in/success?order_id=${idempotencyKey}&provider=paypal`,
          cancelUrl: `${baseUrl}/drop-in/upload?canceled=true`,
          metadata: {
            type: 'drop_in_upload',
            attendee_id: attendee.id,
            include_gift: includeGift.toString(),
            drop_in_photo_id: dropInPhoto.id,
            tx_ref: idempotencyKey,
          },
        });

        const approvalUrl = getApprovalUrl(order);
        if (!approvalUrl) {
          throw new Error('Failed to get PayPal approval URL');
        }

        checkoutUrl = approvalUrl;
        sessionId = order.id;
      } else {
        throw new Error(`Unsupported payment gateway: ${selectedGateway}`);
      }
    } catch (error) {
      // Clean up drop-in record if checkout fails
      await supabase.from('drop_in_photos').delete().eq('id', dropInPhoto.id);
      await supabase.storage.from('media').remove([storagePath]);
      
      console.error('Checkout session error:', error);
      return NextResponse.json(
        { 
          error: 'Failed to create checkout session',
          gateway: selectedGateway,
          availableGateways: gatewaySelection.availableGateways,
        },
        { status: 500 }
      );
    }

    // Store checkout session ID (we'll use a separate metadata column or JSONB)
    // For now, we'll store it in a way that the webhook can find it
    // The webhook will match by attendee_id and pending status

    return NextResponse.json({
      success: true,
      dropInPhotoId: dropInPhoto.id,
      checkoutUrl,
      sessionId,
      gateway: selectedGateway,
      gatewaySelection: {
        reason: gatewaySelection.reason,
        availableGateways: gatewaySelection.availableGateways,
      },
      message: includeGift
        ? 'Complete payment to upload and gift access to recipient'
        : 'Complete payment to make your photo discoverable',
    });

  } catch (error) {
    console.error('Drop-in upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}

