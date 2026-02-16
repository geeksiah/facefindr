# Phase 7: Notifications & Verification System

## Overview

Comprehensive notification system with multi-channel support (Email, SMS, WhatsApp, Push), OTP verification, and strategic ad placements.

---

## 1. Notification Channels

### Supported Channels

| Channel | Provider(s) | Use Cases |
|---------|------------|-----------|
| **Email** | Supabase Auth, Resend, SendGrid | All notifications |
| **SMS** | Twilio, Africa's Talking, Termii | OTP, urgent alerts |
| **WhatsApp** | Twilio, MessageBird | Order updates, photo drops |
| **Push** | FCM, APNs, Web Push | Real-time alerts |
| **In-App** | Built-in | All notifications |

### Admin Configuration

Admin can toggle each channel and set per-country providers:

```
┌─────────────────────────────────────────────────────────────┐
│                ADMIN NOTIFICATION SETTINGS                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Channels:                                                   │
│  ├── [x] Email       (Always enabled)                        │
│  ├── [ ] SMS         (Toggle on/off)                         │
│  ├── [ ] WhatsApp    (Toggle on/off)                         │
│  └── [x] Push        (Toggle on/off)                         │
│                                                              │
│  SMS Providers by Country:                                   │
│  ├── US, GB, CA, AU → Twilio                                │
│  ├── GH, KE, UG, TZ → Africa's Talking                      │
│  └── NG             → Termii                                │
│                                                              │
│  WhatsApp Providers:                                         │
│  ├── International  → Twilio                                │
│  └── Africa         → MessageBird                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Notification Types

### Templates

| Code | Name | Channels | Description |
|------|------|----------|-------------|
| `photo_drop` | Photo Drop | All | New photos matching user's face |
| `payout_success` | Payout Success | Email, SMS, Push | Creator payout completed |
| `order_shipped` | Order Shipped | All | Print order has shipped |
| `verification_otp` | Verification OTP | Email, SMS | OTP code for verification |
| `event_live` | Event Live | All | Event is now live |
| `purchase_complete` | Purchase Complete | Email, Push | Photo purchase confirmed |

### Template Variables

Templates support dynamic variables:

```
Subject: "New photos from {{event_name}}!"
Body: "Hi {{user_name}}, {{photo_count}} new photos match your face..."
```

---

## 3. Verification System

### Phone/Email OTP

```
┌─────────────────────────────────────────────────────────────┐
│                    VERIFICATION FLOW                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Check Admin Settings                                     │
│     ├── Email verification enabled?                          │
│     ├── Email verification required?                         │
│     ├── Phone verification enabled?                          │
│     ├── Phone verification required?                         │
│     └── User can choose method?                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. User Chooses Method (if allowed)                         │
│                                                              │
│     [Verify via Email]    [Verify via Phone]                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Send OTP                                                 │
│     ├── Generate 6-digit code                                │
│     ├── Store with 10-minute expiry                          │
│     ├── Send via Email/SMS                                   │
│     └── Rate limit: 5 attempts per hour                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. User Enters Code                                         │
│                                                              │
│     [  1  ] [  2  ] [  3  ] [  4  ] [  5  ] [  6  ]         │
│                                                              │
│     [Verify]                [Resend Code]                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Verify & Update Status                                   │
│     ├── Check code matches                                   │
│     ├── Check not expired                                    │
│     ├── Check attempts < 5                                   │
│     ├── Mark as verified                                     │
│     └── Update user preferences                              │
└─────────────────────────────────────────────────────────────┘
```

### Admin Controls

| Setting | Description |
|---------|-------------|
| `email_verification_enabled` | Allow email verification |
| `email_verification_required` | Force email verification |
| `phone_verification_enabled` | Allow phone verification |
| `phone_verification_required` | Force phone verification |
| `user_can_choose_verification` | Let user pick method |

---

## 4. Real-Time Updates

### Supabase Realtime

Notifications table is enabled for realtime:

```typescript
// Client-side subscription
const channel = supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    { event: 'INSERT', table: 'notifications' },
    (payload) => {
      // New notification received
      showToast(payload.new);
    }
  )
  .subscribe();
```

### NotificationBell Component

```tsx
import { NotificationBell } from '@/components/notifications';

// In your header
<NotificationBell />
```

Features:
- Real-time unread count badge
- Dropdown with recent notifications
- Mark as read (single or all)
- Links to full notification center

---

## 5. Ad Placements

### Available Placements

| Code | Location | Size | Variant |
|------|----------|------|---------|
| `dashboard_banner` | Dashboard top | 1200x100 | banner |
| `dashboard_sidebar` | Dashboard side | 300x250 | sidebar |
| `gallery_banner` | Gallery top | 1200x100 | banner |
| `gallery_inline` | Between photos | 600x100 | inline |
| `checkout_sidebar` | Checkout page | 300x250 | sidebar |
| `event_page_banner` | Event pages | 1200x150 | banner |
| `settings_inline` | Settings page | 600x100 | inline |
| `mobile_bottom_sheet` | Mobile bottom | 375x80 | bottom-sheet |

### Usage

```tsx
import { 
  DashboardBanner, 
  DashboardSidebar,
  GalleryInline,
  MobileBottomSheet 
} from '@/components/notifications';

// In dashboard layout
<DashboardBanner />

// In sidebar
<DashboardSidebar />

// Between photo rows
<GalleryInline />

// Mobile only
<MobileBottomSheet />
```

### Targeting

Ads can be targeted by:
- User type (photographer, attendee)
- Subscription plan (free, starter, pro, studio)
- Country

### Campaign Structure

```javascript
{
  campaign_name: "New Feature: Live Event Mode",
  headline: "Introducing Live Event Mode",
  body_text: "Share photos in real-time at your events!",
  cta_text: "Learn More",
  cta_url: "/features/live-event-mode",
  
  // Targeting
  target_user_types: ["photographer"],
  target_plans: ["pro", "studio"],
  target_countries: null, // All countries
  
  // Schedule
  start_date: "2026-01-15",
  end_date: "2026-02-15",
  
  // Styling
  background_color: "#0A84FF",
  text_color: "#FFFFFF",
  accent_color: "#34C759"
}
```

---

## 6. SMS Provider Integration

### Twilio (International)

```typescript
// Environment variables needed
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

### Africa's Talking (GH, KE, UG, TZ, RW)

```typescript
AFRICAS_TALKING_API_KEY=xxx
AFRICAS_TALKING_USERNAME=xxx
AFRICAS_TALKING_SHORTCODE=xxx
```

### Termii (NG)

```typescript
TERMII_API_KEY=xxx
TERMII_SENDER_ID=xxx
```

---

## 7. Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `admin_notification_settings` | Global notification config |
| `messaging_providers` | SMS/WhatsApp provider config |
| `notification_templates` | Template definitions |
| `user_notification_preferences` | User channel preferences |
| `notifications` | Sent notifications |
| `verification_codes` | OTP codes |
| `ad_placements` | Ad slot definitions |
| `ad_campaigns` | Active campaigns |

---

## 8. API Endpoints

### Notifications
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications` - Mark as read

### Verification
- `GET /api/auth/verify` - Get verification settings
- `POST /api/auth/verify` - Send or verify OTP

### Ads
- `GET /api/ads?placement=xxx` - Get ad for placement
- `POST /api/ads` - Track click

---

## 9. Notification Flow Example

### Photo Drop Notification

```
1. New photos uploaded to event
                │
                ▼
2. Face matching completes
   → 15 photos match user "John"
                │
                ▼
3. Trigger notification
   sendNotification({
     userId: john_id,
     templateCode: 'photo_drop',
     variables: {
       user_name: 'John',
       event_name: 'Wedding 2026',
       photo_count: '15',
       view_url: 'https://...',
     }
   })
                │
                ▼
4. Check user preferences
   ├── Email: ✓ Enabled
   ├── SMS: ✓ Enabled, phone verified
   ├── Push: ✓ Enabled
   └── WhatsApp: ✗ Not opted in
                │
                ▼
5. Send via enabled channels
   ├── Email: "15 new photos from Wedding 2026!"
   ├── SMS: "Ferchr: 15 new photos match you!"
   └── Push: "New Photos!" + "15 photos match..."
```

---

## 10. Admin Dashboard Requirements

### Notification Settings
- Toggle channels (SMS, WhatsApp)
- Configure verification requirements
- Manage provider API keys per country
- View notification logs

### Ad Management
- Create/edit campaigns
- Set targeting rules
- View impression/click stats
- Schedule campaigns
