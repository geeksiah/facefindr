# Phase 6: Photo Delivery

## Overview

Photo delivery system handling watermarks, purchases, downloads, and entitlements.

---

## 1. Watermark System

### Watermark Settings

Photographers can configure:

| Setting | Options | Default |
|---------|---------|---------|
| Type | text, logo, both | text |
| Text Content | Custom text | null |
| Text Font | Font family | Arial |
| Text Size | Pixels | 24 |
| Text Color | Hex color | #FFFFFF |
| Text Opacity | 0-1 | 0.5 |
| Logo URL | Image URL | null |
| Logo Width | Pixels | 150 |
| Logo Opacity | 0-1 | 0.5 |
| Position | center, corners, tile | center |
| Tile Spacing | Pixels | 100 |
| Tile Angle | Degrees | -30 |

### Watermark Positions

```
┌─────────────────────────────────────┐
│ top-left              top-right    │
│                                     │
│                                     │
│            center                   │
│                                     │
│                                     │
│ bottom-left        bottom-right    │
└─────────────────────────────────────┘

Tile pattern:
┌─────────────────────────────────────┐
│   ©   ©   ©   ©   ©   ©   ©       │
│ ©   ©   ©   ©   ©   ©   ©   ©     │
│   ©   ©   ©   ©   ©   ©   ©       │
│ ©   ©   ©   ©   ©   ©   ©   ©     │
└─────────────────────────────────────┘
```

### Preview Generation

1. Original uploaded → triggers watermark Edge Function
2. Edge Function:
   - Resizes to preview size (1200px default)
   - Applies watermark based on settings
   - Generates thumbnail (400px)
   - Uploads to storage
3. Updates media record with preview paths

---

## 2. Digital Products

### Available Products

| Product | Resolution | Price | Downloads | Expiry |
|---------|-----------|-------|-----------|--------|
| Web Resolution | 1200px | $2.99 | 5 | 30 days |
| Standard | 2400px | $4.99 | 5 | 30 days |
| Full Resolution | Original | $7.99 | 3 | 30 days |
| Full + RAW | Original + RAW | $14.99 | 2 | 30 days |
| Event Package (Web) | 1200px | $19.99 | 3 | 30 days |
| Event Package (Full) | Original | $39.99 | 2 | 30 days |

### Resolution Hierarchy

```
web (1200px) ← standard (2400px) ← full (original) ← raw
```

If you own "full", you can download web and standard too.

### Event-Specific Pricing

Photographers can override default prices per event:

```javascript
// Event pricing table
{
  event_id: "event-123",
  digital_product_id: "product-456",
  price: 499, // Override to $4.99
  is_available: true
}
```

---

## 3. Shopping Cart

### Cart Features

- Multiple items from multiple events
- Quantity tracking (for prints)
- Price locked at time of adding
- Automatic cleanup after purchase

### Cart API

```typescript
// Get cart
GET /api/cart

// Add to cart
POST /api/cart
{
  eventId: "...",
  digitalProductId: "...",
  mediaId: "..." // for single photos
}

// Remove item
DELETE /api/cart?itemId=...

// Clear cart
DELETE /api/cart?clear=true
```

---

## 4. Purchase Flow

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PURCHASE FLOW                           │
└─────────────────────────────────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ View     │  │ Browse   │  │ Scan     │
    │ Photo    │  │ Event    │  │ Face     │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         └──────┬──────┴──────┬──────┘
                ▼             ▼
         ┌──────────┐  ┌──────────┐
         │ Add to   │  │ Buy      │
         │ Cart     │  │ Package  │
         └────┬─────┘  └────┬─────┘
              │             │
              └──────┬──────┘
                     ▼
              ┌──────────┐
              │ Checkout │
              │ (Stripe/ │
              │ Flutterw/│
              │ PayPal)  │
              └────┬─────┘
                   │
                   ▼
              ┌──────────┐
              │ Payment  │
              │ Confirmed│
              └────┬─────┘
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │ Create │ │ Credit │ │ Send   │
    │ Entitl-│ │ Photo- │ │ Receipt│
    │ ments  │ │ grapher│ │        │
    └────────┘ └────────┘ └────────┘
```

### Purchase Record

```javascript
{
  order_number: "FF-20260114-A3B2C",
  attendee_id: "...",
  photographer_id: "...",
  event_id: "...",
  subtotal: 1299,         // $12.99
  platform_fee: 130,      // $1.30 (10% for Pro plan)
  photographer_amount: 1169, // $11.69
  total_amount: 1299,
  currency: "USD",
  payment_status: "succeeded",
  status: "completed"
}
```

---

## 5. Entitlements

### Entitlement Types

| Type | Description |
|------|-------------|
| single_photo | Access to one specific photo |
| event_all | Access to all matched photos in event |
| gifted | Photo gifted by photographer |
| free_preview | Limited preview access |

### Entitlement Check

```javascript
// Check if user can access photo
const access = await checkEntitlement(userId, mediaId, 'full');

// Result
{
  hasAccess: true,
  entitlementId: "...",
  maxResolution: "full",
  downloadsRemaining: 2,
  expiresAt: "2026-02-14T..."
}
```

---

## 6. Secure Downloads

### Download Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DOWNLOAD FLOW                            │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Download"
           │
           ▼
   ┌───────────────┐
   │ Check         │
   │ Entitlement   │───── No access ────▶ Show pricing
   └───────┬───────┘
           │ Has access
           ▼
   ┌───────────────┐
   │ Generate      │
   │ Download Token│
   │ (1 hour TTL)  │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │ Return        │
   │ /api/download │
   │ /[token]      │
   └───────┬───────┘
           │
           ▼ (User navigates)
   ┌───────────────┐
   │ Validate      │
   │ Token         │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │ Increment     │
   │ Download Count│
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │ Log Download  │
   │ History       │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │ Generate      │
   │ Signed URL    │
   │ (5 min TTL)   │
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │ Redirect to   │
   │ Storage URL   │
   └───────────────┘
```

### Token Security

- 64-character random hex token
- 1-hour expiry
- Single use (or configurable)
- Optional IP lock
- Tracks: who, what, when, where

---

## 7. Database Schema

### New Tables

| Table | Purpose |
|-------|---------|
| watermark_settings | Photographer watermark config |
| digital_products | Available download products |
| event_pricing | Per-event price overrides |
| cart_items | Shopping cart |
| photo_purchases | Completed orders |
| purchase_items | Line items in orders |
| entitlements | User access rights |
| download_history | Download audit log |
| download_tokens | Secure download links |

---

## 8. API Endpoints

### Cart
- `GET /api/cart` - Get cart contents
- `POST /api/cart` - Add item
- `DELETE /api/cart?itemId=x` - Remove item
- `DELETE /api/cart?clear=true` - Clear cart

### Products
- `GET /api/products/digital` - List products
- `GET /api/products/digital?eventId=x` - With event pricing

### Purchases
- `GET /api/purchases` - Purchase history

### Entitlements
- `GET /api/entitlements` - List user entitlements
- `GET /api/entitlements?mediaId=x` - Check photo access
- `POST /api/entitlements` - Request download token

### Downloads
- `GET /api/download/[token]` - Download file

### Watermark
- `GET /api/photographer/watermark` - Get settings
- `POST /api/photographer/watermark` - Save settings

---

## 9. Photographer Features

### Gift Photo

Photographers can gift photos to attendees:

```javascript
await giftPhoto(
  photographerId,
  attendeeId,
  mediaId,
  'full', // resolution
  'Thanks for being a great model!' // optional message
);
```

### Event Package Pricing

Set custom prices for event packages:

```sql
INSERT INTO event_pricing (event_id, digital_product_id, price, is_available)
VALUES ('event-id', 'event-package-full', 2999, true);
```

---

## 10. Implementation Notes

### Watermark Processing

Currently a placeholder - needs Edge Function implementation:

```typescript
// Supabase Edge Function: generate-watermark
// - Receives: { mediaId, photographerId, originalPath, settings }
// - Uses: Sharp for image processing
// - Returns: { previewPath, thumbnailPath }
```

### Download Limits

- Enforced at token generation time
- Tracked in entitlements table
- Can be extended by photographer

### Expiry Handling

- Checked at access time
- Expired entitlements return no access
- Cleanup job removes old tokens
