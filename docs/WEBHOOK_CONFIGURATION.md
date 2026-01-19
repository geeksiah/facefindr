# Webhook Configuration Guide

## Overview
This document outlines webhook configuration for all payment gateways used in FaceFindr.

## Payment Gateways

### 1. Stripe
**Primary Use**: Global payments, subscriptions, drop-in uploads

**Webhook Endpoints**:
- `/api/webhooks/stripe` - Main Stripe webhook (subscriptions, event photo purchases)
- `/api/drop-in/webhook` - Drop-in specific webhook

**Required Environment Variable**:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Events to Subscribe**:
- `checkout.session.completed` - Payment completed
- `payment_intent.succeeded` - Payment succeeded (fallback)
- `payment_intent.payment_failed` - Payment failed
- `customer.subscription.created` - Subscription created
- `customer.subscription.updated` - Subscription updated
- `customer.subscription.deleted` - Subscription cancelled

**Configuration Steps**:
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter endpoint URL: `https://your-app.com/api/webhooks/stripe`
4. Select events listed above
5. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`
6. Repeat for drop-in webhook: `https://your-app.com/api/drop-in/webhook`

### 2. Flutterwave
**Primary Use**: African countries (GH, NG, KE, etc.)

**Webhook Endpoint**:
- `/api/webhooks/flutterwave`

**Required Environment Variable**:
```
FLUTTERWAVE_WEBHOOK_SECRET=your-webhook-secret-hash
```

**Events to Subscribe**:
- Payment completion events
- Transaction status updates

**Configuration Steps**:
1. Go to [Flutterwave Dashboard](https://dashboard.flutterwave.com/settings/webhooks)
2. Add webhook URL: `https://your-app.com/api/webhooks/flutterwave`
3. Select payment events
4. Copy webhook secret hash to `FLUTTERWAVE_WEBHOOK_SECRET`

### 3. PayPal
**Primary Use**: Global alternative, especially for regions where Stripe is limited

**Webhook Endpoint**:
- `/api/webhooks/paypal`

**Required Environment Variable**:
```
PAYPAL_WEBHOOK_ID=your-webhook-id
```

**Events to Subscribe**:
- `PAYMENT.CAPTURE.COMPLETED` - Payment completed
- `PAYMENT.CAPTURE.DENIED` - Payment denied
- `BILLING.SUBSCRIPTION.CREATED` - Subscription created
- `BILLING.SUBSCRIPTION.CANCELLED` - Subscription cancelled

**Configuration Steps**:
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard)
2. Navigate to your app → Webhooks
3. Add webhook URL: `https://your-app.com/api/webhooks/paypal`
4. Select events listed above
5. Copy webhook ID to `PAYPAL_WEBHOOK_ID`

## Gateway Selection Logic

The system automatically selects payment gateways based on:
1. **User Preference** - From `subscription_settings.preferred_payment_gateway`
2. **Country** - Based on user's country code (e.g., GH → Flutterwave, US → Stripe)
3. **Availability** - What's configured for photographer/platform

See `docs/PAYMENT_GATEWAY_AUDIT.md` for detailed selection logic.

## Testing Webhooks

### Local Testing (Stripe CLI)
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed
```

### Production Testing
1. Use test mode keys
2. Create test payments
3. Verify webhook events are received
4. Check database records are updated correctly

## Security

All webhooks verify signatures:
- **Stripe**: Uses `stripe-signature` header
- **Flutterwave**: Uses custom signature verification
- **PayPal**: Uses webhook ID verification

Never skip signature verification in production!

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook URL is accessible (not behind firewall)
2. Verify webhook secret is correct
3. Check webhook logs in gateway dashboard
4. Verify endpoint is returning 200 status

### Signature Verification Fails
1. Ensure webhook secret matches exactly
2. Check request body is not modified (no parsing before verification)
3. Verify timestamp is within tolerance window

### Events Not Processing
1. Check webhook handler logs
2. Verify event type matches expected types
3. Check database constraints/RLS policies
4. Verify metadata contains required fields
