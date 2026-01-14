# Phase 8: Analytics Dashboard

## Overview

Comprehensive analytics system for tracking views, revenue, event performance, and real-time activity with dynamic data syncing.

---

## 1. Key Metrics

### Dashboard Stats

| Metric | Description |
|--------|-------------|
| **Total Views** | All photo and event page views |
| **Unique Visitors** | Distinct visitors (by IP hash) |
| **Total Revenue** | Gross revenue from all sales |
| **Conversion Rate** | Sales / Views percentage |
| **Total Downloads** | Purchased photo downloads |
| **Avg Views/Event** | Average views per event |
| **Avg Revenue/Event** | Average revenue per event |

---

## 2. View Tracking

### Automatic Tracking

```tsx
import { useTrackView } from '@/hooks';

// Track event page view
function EventPage({ eventId }: { eventId: string }) {
  useTrackView({ viewType: 'event', eventId });
  
  return <div>...</div>;
}

// Track photo view
function PhotoModal({ mediaId, eventId }: Props) {
  useTrackView({ viewType: 'photo', mediaId, eventId });
  
  return <div>...</div>;
}
```

### Manual Tracking

```tsx
import { trackViewEvent } from '@/hooks';

// Track on button click
<button onClick={() => trackViewEvent({ 
  viewType: 'photo', 
  mediaId: photo.id 
})}>
  View Photo
</button>
```

### What's Tracked

| Field | Description |
|-------|-------------|
| `view_type` | photo, event, profile, gallery |
| `event_id` | Associated event |
| `media_id` | Specific photo viewed |
| `viewer_id` | User ID (if logged in) |
| `ip_hash` | SHA256 of IP (for unique counts) |
| `country_code` | Geo from headers |
| `device_type` | mobile, tablet, desktop |
| `session_id` | Browser session |
| `referrer` | Traffic source |
| `user_agent` | Browser info |

---

## 3. Time Series Data

### Available Periods

| Range | Description |
|-------|-------------|
| `7d` | Last 7 days |
| `30d` | Last 30 days (default) |
| `90d` | Last 90 days |
| `365d` | Last year |
| `all` | All time |

### Data Points Per Day

- Views (total and unique)
- Revenue (gross and net)
- Sales count
- Downloads
- Device breakdown
- Traffic sources

---

## 4. Event Performance

Each event tracks:

```javascript
{
  total_photos: 150,
  photos_with_faces: 120,
  unique_faces_detected: 45,
  total_views: 2500,
  unique_visitors: 800,
  face_scans: 200,
  photos_matched: 150,
  cart_additions: 50,
  purchases: 25,
  conversion_rate: 1.0,
  total_revenue: 50000, // cents
  avg_order_value: 2000, // cents
  top_viewed_photos: [...],
  top_sold_photos: [...],
  traffic_sources: {...}
}
```

---

## 5. Real-Time Dashboard

### Live Stats Component

```tsx
import { RealtimeStats } from '@/components/analytics';

function Dashboard() {
  return (
    <div>
      <RealtimeStats />
    </div>
  );
}
```

### Live Metrics

- Active viewers right now
- Views this hour
- Sales this hour
- Revenue this hour
- Views today
- Sales today
- Revenue today

### Real-Time Updates

Uses Supabase Realtime for instant updates:

```typescript
// Subscribes to analytics_realtime table
supabase
  .channel('realtime-analytics')
  .on('postgres_changes', { event: '*', table: 'analytics_realtime' }, callback)
  .subscribe();
```

---

## 6. Traffic Sources

### Categories

| Source | Examples |
|--------|----------|
| **Direct** | Direct URL entry, bookmarks |
| **Social** | Facebook, Instagram, Twitter |
| **Search** | Google, Bing, DuckDuckGo |
| **Referral** | Other websites, links |

### Detection

Parsed from `Referer` header:

```typescript
function categorizeReferrer(referrer: string) {
  if (!referrer) return 'direct';
  if (referrer.includes('google') || referrer.includes('bing')) return 'search';
  if (referrer.includes('facebook') || referrer.includes('instagram')) return 'social';
  return 'referral';
}
```

---

## 7. Device Analytics

### Breakdown

- Mobile (phones)
- Desktop (computers)
- Tablet (iPads, etc.)

### Detection

From User-Agent header:

```typescript
function detectDeviceType(userAgent: string): DeviceType {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}
```

---

## 8. Data Aggregation

### Daily Aggregation

A cron job runs daily to:

1. Aggregate raw views into `analytics_daily`
2. Update `analytics_event_performance`
3. Calculate revenue totals

### Storage Optimization

- Raw views stored for 90 days
- Daily aggregates kept indefinitely
- Event performance updated nightly

---

## 9. API Endpoints

### GET /api/analytics

Query params:
- `type`: dashboard, stats, timeseries, events, devices, traffic, activity, realtime
- `range`: 7d, 30d, 90d, 365d, all
- `eventId`: Filter by event (optional)

```typescript
// Get full dashboard
fetch('/api/analytics?type=dashboard&range=30d')

// Get just stats
fetch('/api/analytics?type=stats&range=7d')

// Get time series for specific event
fetch('/api/analytics?type=timeseries&eventId=xxx')

// Get realtime
fetch('/api/analytics?type=realtime')
```

### POST /api/analytics/track

Track a view:

```typescript
fetch('/api/analytics/track', {
  method: 'POST',
  body: JSON.stringify({
    viewType: 'photo',
    mediaId: 'xxx',
    eventId: 'yyy',
    sessionId: 'zzz',
  })
})
```

---

## 10. Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `analytics_views` | Raw view records |
| `analytics_daily` | Daily aggregates |
| `analytics_revenue` | Revenue by day |
| `analytics_event_performance` | Event-level stats |
| `analytics_realtime` | Live counters |

### Indexes

- `photographer_id` - Fast photographer filtering
- `event_id` - Fast event filtering
- `date` - Time series queries
- `viewed_at` - Recent views

---

## 11. Privacy Considerations

### Data Protection

- IP addresses are hashed (SHA256)
- No personal data in analytics
- Viewer IDs optional
- Country-level geo only (no city)

### Data Retention

- Raw views: 90 days
- Aggregates: Indefinite
- Real-time: 24 hours

---

## 12. Dashboard UI Features

### Stats Cards

Large metric cards with:
- Icon and color
- Current value
- Optional trend indicator

### Charts

1. **Views Over Time** - Bar chart of daily views
2. **Revenue Over Time** - Bar chart of daily revenue
3. **Device Breakdown** - Progress bars by device
4. **Traffic Sources** - Progress bars by source

### Top Events Table

Ranked list of events by:
- Views
- Revenue
- Conversion rate

### Real-Time Panel

Live updating stats with:
- Green pulse indicator
- "Last updated" timestamp
- Active viewers count
