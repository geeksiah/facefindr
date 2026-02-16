# Plan Features Documentation

This document describes all available feature codes for Creator Plans and Drop-in Credits.

## Overview

Ferchr uses a modular pricing system where features can be assigned to any plan with custom values. Features are stored in the `plan_features` table and assigned to plans via `plan_feature_assignments`.

### Plan Types
- **photographer**: Subscription plans for photographers (monthly/yearly)
- **drop_in**: Pay-as-you-go credits for attendees

---

## Creator Plan Feature Codes

These features apply to photographer subscription plans.

### Event Limits

| Code | Name | Type | Description | Example Values |
|------|------|------|-------------|----------------|
| `max_active_events` | Max Active Events | numeric | Maximum number of active events allowed at once | Free: `1`, Pro: `5`, Business: `25` |
| `max_photos_per_event` | Max Photos Per Event | numeric | Maximum photos that can be uploaded per event | Free: `100`, Pro: `500`, Business: `2000` |
| `max_face_ops_per_event` | Max Face Operations | numeric | Face recognition operations allowed per event | Free: `0`, Pro: `500`, Business: `5000` |

### Feature Flags

| Code | Name | Type | Description | Example Values |
|------|------|------|-------------|----------------|
| `face_recognition_enabled` | Face Recognition | boolean | Enable AI face recognition for events | Free: `false`, Pro: `true` |
| `priority_processing` | Priority Processing | boolean | Get faster photo processing and indexing | Free: `false`, Business: `true` |
| `api_access` | API Access | boolean | Access to Ferchr API for integrations | Free: `false`, Enterprise: `true` |
| `custom_watermark` | Custom Watermark | boolean | Upload and use custom watermarks on photos | Free: `false`, Pro: `true` |
| `live_event_mode` | Live Event Mode | boolean | Enable real-time notifications during events | Free: `false`, Pro: `true` |
| `advanced_analytics` | Advanced Analytics | boolean | Access to detailed analytics and insights | Free: `false`, Pro: `true` |

### Storage & Retention

| Code | Name | Type | Description | Example Values |
|------|------|------|-------------|----------------|
| `retention_days` | Photo Retention | numeric | Number of days photos are retained | Free: `30`, Pro: `365`, Enterprise: `9999` |
| `storage_limit_gb` | Storage Limit | numeric | Storage space in GB | Free: `1`, Pro: `50`, Enterprise: `500` |

---

## Drop-in Feature Codes

Drop-in is a **pay-as-you-go** system, NOT a subscription. Attendees purchase credits that they consume when using premium features.

### How Drop-in Works

1. **Attendees buy credit packs** (e.g., 10 credits for $4.99, 25 credits for $9.99)
2. **Credits are consumed** when using premium Drop-in features
3. **Contact Search is FREE** - searching within Ferchr events
4. **External Search costs 1 credit** - searching across external platforms

### Drop-in Feature Codes

| Code | Name | Type | Description | Default |
|------|------|------|-------------|---------|
| `drop_in_contact_search` | Contact Search | boolean | Search for photos from contacts and registered events (FREE) | `true` |
| `drop_in_external_search` | External Search | boolean | Search for photos on external social media and websites | `false` (requires credits) |
| `drop_in_gift_enabled` | Gift Drop-Ins | boolean | Allow gifting drop-in notifications to recipients | `false` |
| `drop_in_notifications` | Drop-In Notifications | boolean | Receive notifications when photos are found | `true` |
| `drop_in_max_uploads_per_month` | Max Uploads Per Month | numeric | Monthly limit on drop-in photo uploads | `10` |
| `drop_in_unlimited_uploads` | Unlimited Uploads | boolean | Remove monthly upload limits | `false` |

---

## How to Create a New Feature

### 1. Add to Database

```sql
INSERT INTO plan_features (
  code,
  name,
  description,
  feature_type,
  default_value,
  applicable_to,
  category,
  display_order
) VALUES (
  'my_new_feature',           -- Unique code (snake_case)
  'My New Feature',           -- Display name
  'Description of feature',   -- Detailed description
  'boolean',                  -- Type: 'boolean', 'numeric', 'limit', 'text'
  'false'::jsonb,             -- Default value as JSONB
  ARRAY['photographer']::plan_type[],  -- Which plan types can use this
  'events',                   -- Category for grouping
  100                         -- Display order (lower = first)
);
```

### 2. Assign to a Plan

```sql
INSERT INTO plan_feature_assignments (
  plan_id,
  feature_id,
  feature_value
) VALUES (
  'uuid-of-plan',
  (SELECT id FROM plan_features WHERE code = 'my_new_feature'),
  'true'::jsonb
);
```

### 3. Enforce in Code

Use the enforcement functions in your API routes:

```typescript
import { checkFeature, checkLimit, LimitExceededError, FeatureNotEnabledError } from '@/lib/subscription/enforcement';

// Check if feature is enabled
const hasFeature = await checkFeature(photographerId, 'face_recognition_enabled');
if (!hasFeature) {
  throw new FeatureNotEnabledError('Face recognition requires a Pro plan');
}

// Check numeric limit
const canUpload = await checkLimit(photographerId, 'max_photos_per_event', currentCount);
if (!canUpload) {
  throw new LimitExceededError('Photo limit reached for this event');
}
```

---

## Credit Pack Configuration (Drop-in)

Credit packs are defined in the billing page. Here's the current configuration:

| Pack ID | Name | Price | Credits | Expiry |
|---------|------|-------|---------|--------|
| `pack_10` | Starter Pack | $4.99 | 10 | 1 year |
| `pack_25` | Value Pack | $9.99 | 25 | 1 year |
| `pack_50` | Pro Pack | $17.99 | 50 | 1 year |
| `pack_100` | Power Pack | $29.99 | 100 | Never |

### Credit Consumption

| Action | Cost |
|--------|------|
| Contact Search (within Ferchr) | FREE |
| External Search (web/social) | 1 credit |
| Gift a Drop-in notification | 1 credit |

---

## Admin Dashboard Usage

In the Admin dashboard, when creating or editing a plan:

1. **Select Plan Type**: Choose "photographer" or "drop_in"
2. **Add Features**: Select from available feature codes
3. **Set Values**: Configure the value for each feature
   - For boolean: `true` or `false`
   - For numeric: any number (e.g., `500` for max photos)
4. **Save**: The plan is now configured with those features

### Example Plan Configuration

**Pro Plan (Creator)**:
```json
{
  "max_active_events": 5,
  "max_photos_per_event": 500,
  "max_face_ops_per_event": 500,
  "face_recognition_enabled": true,
  "custom_watermark": true,
  "live_event_mode": true,
  "advanced_analytics": true,
  "retention_days": 365,
  "storage_limit_gb": 50
}
```

---

## Feature Categories

Features are grouped into categories for organization:

| Category | Description |
|----------|-------------|
| `events` | Event creation and management limits |
| `photos` | Photo upload and storage limits |
| `face_recognition` | AI face recognition features |
| `performance` | Processing priority and speed |
| `integrations` | API access and third-party integrations |
| `branding` | Watermarks and white-label options |
| `analytics` | Reporting and insights |
| `storage` | Storage space and retention |
| `drop_in` | Attendee drop-in search features |

---

## Database Schema

### plan_features
```sql
CREATE TABLE plan_features (
  id UUID PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  feature_type VARCHAR(50) NOT NULL,  -- 'limit', 'boolean', 'numeric', 'text'
  default_value JSONB,
  applicable_to plan_type[] NOT NULL,
  category VARCHAR(100),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### plan_feature_assignments
```sql
CREATE TABLE plan_feature_assignments (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES subscription_plans(id),
  feature_id UUID REFERENCES plan_features(id),
  feature_value JSONB NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(plan_id, feature_id)
);
```

---

## Quick Reference: All Feature Codes

### Creator Features
- `max_active_events`
- `max_photos_per_event`
- `max_face_ops_per_event`
- `face_recognition_enabled`
- `priority_processing`
- `api_access`
- `custom_watermark`
- `live_event_mode`
- `advanced_analytics`
- `retention_days`
- `storage_limit_gb`

### Drop-in Features
- `drop_in_contact_search`
- `drop_in_external_search`
- `drop_in_gift_enabled`
- `drop_in_notifications`
- `drop_in_max_uploads_per_month`
- `drop_in_unlimited_uploads`
