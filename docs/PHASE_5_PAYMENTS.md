# Phase 5: Payment Integration

This document describes the payment system implementation for Ferchr, supporting multiple payment providers for global coverage.

## Payment Providers

### 1. Stripe Connect (Global)
- **Markets**: US, UK, Canada, Australia, Europe
- **Methods**: Card payments
- **Features**: 
  - Express onboarding for photographers
  - Split payments (platform fee + photographer earnings)
  - Automatic payouts to bank accounts
  - Dashboard access for photographers

### 2. Flutterwave (Africa)
- **Markets**: Ghana, Nigeria, Kenya, Uganda, Rwanda, South Africa, Tanzania
- **Methods**: 
  - Mobile Money (MTN, Vodafone, AirtelTigo)
  - Card payments
  - Bank transfers
  - USSD
- **Features**:
  - Subaccount system for photographers
  - Automatic split payments
  - Local currency support

### 3. PayPal (Global Alternative)
- **Markets**: Global
- **Methods**: PayPal balance, Cards
- **Features**:
  - Commerce Platform for marketplace payments
  - Split payments with platform fees
  - Familiar checkout experience

## Architecture

### Database Schema

```sql
-- Updated wallet_provider enum
CREATE TYPE wallet_provider AS ENUM ('stripe', 'flutterwave', 'paypal', 'momo');

-- Wallets table supports multiple providers
CREATE TABLE wallets (
    id UUID PRIMARY KEY,
    photographer_id UUID REFERENCES photographers(id),
    provider wallet_provider,
    stripe_account_id VARCHAR(255),
    flutterwave_subaccount_id VARCHAR(255),
    paypal_merchant_id VARCHAR(255),
    status wallet_status,
    country_code VARCHAR(2),
    preferred_currency VARCHAR(3),
    ...
);

-- Transactions with multi-provider support
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    payment_provider wallet_provider,
    stripe_payment_intent_id VARCHAR(255),
    flutterwave_tx_ref VARCHAR(255),
    paypal_order_id VARCHAR(255),
    ...
);

-- Payouts tracking
CREATE TABLE payouts (
    id UUID PRIMARY KEY,
    wallet_id UUID REFERENCES wallets(id),
    payment_provider wallet_provider,
    amount INTEGER,
    status VARCHAR(50),
    ...
);
```

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/wallet` | GET | Fetch photographer's wallets and balances |
| `/api/wallet` | DELETE | Remove a wallet |
| `/api/wallet/onboard` | POST | Create new wallet/start onboarding |
| `/api/checkout` | POST | Create checkout session |
| `/api/checkout/verify` | GET | Verify payment completion |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |
| `/api/webhooks/flutterwave` | POST | Flutterwave webhook handler |
| `/api/webhooks/paypal` | POST | PayPal webhook handler |

## Payment Flow

### 1. Creator Onboarding

```
Creator → Settings → Payments → Add Payment Method
                                           ↓
                              Select Provider (Stripe/Flutterwave/PayPal)
                                           ↓
                              [Stripe] → Redirect to Stripe Express onboarding
                              [Flutterwave] → Enter bank details → Create subaccount
                              [PayPal] → Enter PayPal email → Save
                                           ↓
                              Wallet created → Ready to receive payments
```

### 2. Attendee Purchase

```
Attendee → Event → Select Photos → Checkout
                                      ↓
                        Select available payment method
                                      ↓
                   [Stripe] → Stripe Checkout Session
                   [Flutterwave] → Redirect to Flutterwave
                   [PayPal] → Redirect to PayPal
                                      ↓
                        Complete payment on provider
                                      ↓
                   Webhook confirms payment → Create entitlements
                                      ↓
                        Attendee can download photos
```

### 3. Fee Structure

| Fee Type | Amount |
|----------|--------|
| Platform Fee | 15% |
| Stripe Fee | ~2.9% + $0.30 |
| Flutterwave Card | ~3.5% |
| Flutterwave MoMo | ~1.5% |
| PayPal Fee | ~2.9% + $0.30 |

**Example: $10 photo purchase (Stripe)**
- Gross: $10.00
- Platform fee: $1.50 (15%)
- Stripe fee: ~$0.59 (2.9% + $0.30)
- Creator receives: ~$7.91

## Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Flutterwave
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-...
NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
FLUTTERWAVE_WEBHOOK_SECRET=your-webhook-secret

# PayPal
PAYPAL_CLIENT_ID=your-client-id
PAYPAL_CLIENT_SECRET=your-client-secret
PAYPAL_MODE=sandbox
PAYPAL_WEBHOOK_ID=your-webhook-id
```

## Webhook Setup

### Stripe
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://yourapp.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `account.updated`

### Flutterwave
1. Go to Flutterwave Dashboard → Settings → Webhooks
2. Add webhook URL: `https://yourapp.com/api/webhooks/flutterwave`
3. Copy the secret hash to `FLUTTERWAVE_WEBHOOK_SECRET`

### PayPal
1. Go to PayPal Developer Dashboard → Webhooks
2. Add webhook URL: `https://yourapp.com/api/webhooks/paypal`
3. Select events:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`

## Security Considerations

1. **Webhook Verification**: All webhooks verify signatures before processing
2. **Idempotency**: Transaction records prevent duplicate processing
3. **Server-side Processing**: All payment operations happen server-side
4. **Environment Isolation**: Sandbox/test keys for development

## Testing

### Test Cards (Stripe)
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`

### Test Cards (Flutterwave)
- Success: `5531 8866 5214 2950` (CVV: 564, PIN: 3310, OTP: 12345)

### Test Account (PayPal Sandbox)
- Create buyer/seller sandbox accounts in PayPal Developer Dashboard

## Next Steps

- **Phase 6**: Photo delivery with watermarks, purchases, downloads
- **Phase 7**: Notifications for purchase confirmations
- **Phase 8**: Analytics for revenue tracking
