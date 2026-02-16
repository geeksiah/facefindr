# Payment Gateway Audit & Implementation

## Overview
This document audits all payment flows to ensure they respect user preferences and country-based gateway selection.

## Payment Gateway Selection Logic

### Priority Order:
1. **User Preference** - From `subscription_settings.preferred_payment_gateway`
2. **Country-Based Selection** - Based on user's country code
3. **Available Gateways** - What's configured for photographer/platform
4. **Default** - Stripe (fallback)

### Country Preferences:
- **African Countries (GH, NG, KE, ZA, UG, TZ)**: Flutterwave → Stripe → PayPal
- **US, GB, CA, AU**: Stripe → PayPal
- **Default**: Stripe → PayPal

## Payment Flows Audited

### ✅ 1. Event Photo Purchases (`/api/checkout`)
**Status**: ✅ UPDATED
- Now uses `selectPaymentGateway()` to determine gateway
- Respects user preference from `subscription_settings`
- Falls back to country-based selection
- Checks photographer's available wallets
- Returns available gateways in response

**Changes Made**:
- Added gateway selection logic
- Uses selected gateway instead of hardcoded provider parameter
- Returns gateway selection info in response

### ✅ 2. Drop-In Photo Upload (`/api/drop-in/upload`)
**Status**: ✅ UPDATED
- Now uses `selectPaymentGateway()` 
- Supports Stripe, Flutterwave, and PayPal
- Respects user preference
- Falls back to country-based selection

**Changes Made**:
- Replaced hardcoded Stripe with gateway selector
- Added Flutterwave and PayPal support
- Returns gateway selection info

### ✅ 3. Creator Subscriptions (`/api/subscriptions/checkout`)
**Status**: ✅ UPDATED
- Uses gateway selector
- Currently subscriptions only support Stripe (industry standard)
- Returns error if non-Stripe gateway selected with suggestion

**Changes Made**:
- Added gateway selection (though subscriptions typically use Stripe)
- Returns helpful error if non-Stripe selected

### ✅ 4. Attendee Subscriptions (`/api/attendee/subscription`)
**Status**: ✅ UPDATED
- Uses gateway selector
- Currently subscriptions only support Stripe
- Returns error if non-Stripe gateway selected with suggestion

**Changes Made**:
- Added gateway selection
- Returns helpful error if non-Stripe selected

## New Utility: `gateway-selector.ts`

### Functions:
- `getUserPreferredGateway(userId)` - Gets user's preferred gateway from settings
- `getUserCountry(userId)` - Gets user's country code
- `getAvailableGateways(photographerId)` - Gets photographer's configured wallets
- `selectPaymentGateway(options)` - Main selection function
- `getGatewayForCountry(countryCode, availableGateways)` - Country-based selection
- `isGatewayConfigured(gateway)` - Checks if gateway is configured
- `getConfiguredGateways()` - Gets all configured gateways

## Database Schema Requirements

### `subscription_settings` Table
Should include:
- `preferred_payment_gateway` VARCHAR(20) - User's preferred gateway
- `preferred_currency` VARCHAR(3) - User's preferred currency

### `attendees` Table
Should include:
- `country_code` VARCHAR(2) - User's country

### `photographers` Table
Should include:
- `country_code` VARCHAR(2) - Creator's country

## Webhook Configuration

### Stripe Webhook
- Endpoint: `/api/webhooks/stripe` (existing)
- Endpoint: `/api/drop-in/webhook` (for drop-in payments)
- Events: `checkout.session.completed`, `payment_intent.succeeded`

### Flutterwave Webhook
- Endpoint: `/api/webhooks/flutterwave` (existing)
- Events: Payment completion events

### PayPal Webhook
- Endpoint: `/api/webhooks/paypal` (existing)
- Events: Payment completion events

## Testing Checklist

- [ ] User with preferred gateway (Stripe) → Uses Stripe
- [ ] User with preferred gateway (Flutterwave) → Uses Flutterwave if available
- [ ] User from Ghana → Prefers Flutterwave
- [ ] User from US → Prefers Stripe
- [ ] Creator with only Stripe wallet → Uses Stripe
- [ ] Creator with multiple wallets → Uses user preference or country-based
- [ ] Drop-in upload respects user preference
- [ ] Event photo purchase respects user preference
- [ ] Subscription checkout uses Stripe (or shows error for others)
- [ ] Webhooks configured for all gateways

## Migration Required

Add `preferred_payment_gateway` to `subscription_settings` table if not exists:

```sql
ALTER TABLE subscription_settings 
ADD COLUMN IF NOT EXISTS preferred_payment_gateway VARCHAR(20);

-- Add country_code to attendees if not exists
ALTER TABLE attendees 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Add country_code to photographers if not exists  
ALTER TABLE photographers 
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
```

## Future Enhancements

1. **Subscription Support for Other Gateways**: Currently only Stripe supports subscriptions. Could add:
   - Flutterwave recurring payments
   - PayPal subscriptions

2. **Gateway Preference UI**: Allow users to set preference in settings

3. **Currency-Gateway Mapping**: Some gateways work better with certain currencies

4. **Gateway Availability Check**: Real-time check of gateway availability before checkout
