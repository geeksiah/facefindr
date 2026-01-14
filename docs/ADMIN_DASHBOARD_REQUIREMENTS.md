# Admin Dashboard Requirements

This document outlines all the controls and features needed for the FaceFindr admin dashboard.

## 1. Payout Management

### Queue Overview
- View total pending payouts (count and amount)
- Breakdown by provider (Stripe, Flutterwave, MoMo, PayPal)
- Breakdown by currency (USD, GHS, NGN, etc.)

### Actions
- **Process Single Payout**: Pay a specific photographer
- **Process Batch**: Pay all photographers meeting criteria
- **Retry Failed**: Retry failed payouts from last 24 hours
- **Pause/Resume**: Global toggle for automatic payouts

### Payout History
- View all payouts with filters (status, provider, date range)
- Search by photographer name/email
- Export to CSV/Excel

### Per-Photographer Controls
- View photographer's payout history
- Pause payouts for specific photographer
- Override payout settings temporarily

---

## 2. Platform Settings

### Payout Minimums (By Currency)
```json
{
  "USD": 5000,   // $50.00
  "GHS": 10000,  // GHS 100.00
  "NGN": 500000, // NGN 5,000.00
  "KES": 100000, // KES 1,000.00
  "GBP": 4000,   // £40.00
  "EUR": 4500,   // €45.00
  "ZAR": 50000,  // R500.00
  "UGX": 10000000 // UGX 100,000
}
```

### Fee Configuration
- Platform fee percentage (varies by plan)
- Instant payout fee percentage (default: 1%)
- Provider-specific overrides

### Currencies
- List of supported currencies
- Default currency by country
- Exchange rate source (if needed)

---

## 2.5 Subscription Plans Management

### Plan Features (Editable per plan)

| Feature | Free | Starter | Pro | Studio |
|---------|------|---------|-----|--------|
| Active Events | 3 | 10 | Unlimited | Unlimited |
| Photos/Event | 100 | 500 | 2,000 | 5,000 |
| Face Ops/Event | 500 | 2,000 | 10,000 | 50,000 |
| Storage | 5GB | 25GB | 100GB | 500GB |
| **Platform Fee** | **20%** | **15%** | **10%** | **8%** |
| Custom Watermark | No | Yes | Yes | Yes |
| Custom Branding | No | No | Yes | Yes |
| Live Event Mode | No | No | Yes | Yes |
| Advanced Analytics | No | Yes | Yes | Yes |
| API Access | No | No | Yes | Yes |
| Priority Support | No | Yes | Yes | Dedicated |
| Team Members | 1 | 1 | 3 | 10 |
| White Label | No | No | No | Yes |
| **Print Commission** | **15%** | **20%** | **25%** | **30%** |
| Price/Month | $0 | $9.99 | $29.99 | $79.99 |
| Price/Year | $0 | $79.90 | $239.90 | $639.90 |

### Revenue Strategy

1. **Free Tier (20% fee)**
   - Generous limits attract users
   - Higher platform fee captures revenue from sales
   - Users who sell more will upgrade to reduce fees

2. **Paid Tiers (15%/10%/8% fee)**
   - Lower fees incentivize upgrades
   - Subscription revenue + reduced fees = win-win
   - More features unlock at higher tiers

3. **Print Products**
   - Platform handles fulfillment (zero effort for photographer)
   - Photographer earns commission on each sale
   - Higher plans = higher commission (15% → 30%)
   - Photographer can add markup for extra earnings

### Admin Controls for Subscriptions
- View all subscriptions
- Cancel/refund subscription
- Apply promotional discount
- Extend trial period
- Force plan upgrade/downgrade
- View subscription revenue metrics

---

## 2.6 Print Products Management

### Regional Pricing System

Print products have different pricing per region due to:
- Different fulfillment partners
- Different production costs
- Different currencies
- Different shipping logistics

### Regions

| Region | Countries | Currency | Fulfillment Partner |
|--------|-----------|----------|-------------------|
| US | United States | USD | PrintifyUS |
| GB | United Kingdom | GBP | PrintifyUK |
| EU | DE, FR, IT, ES, NL, BE, AT, PT, IE | EUR | PrintifyEU |
| GH | Ghana | GHS | GhanaPrint |
| NG | Nigeria | NGN | NigeriaPrint |
| KE | Kenya | KES | KenyaPrint |
| ZA | South Africa | ZAR | SAPrint |

### Example Pricing: 8x10 Print

| Region | Base Cost | Base Price | Suggested | Currency |
|--------|-----------|------------|-----------|----------|
| US | $4.50 | $6.99 | $12.99 | USD |
| GB | £4.00 | £6.50 | £11.99 | GBP |
| GH | GHS 25 | GHS 45 | GHS 80 | GHS |
| NG | ₦500 | ₦900 | ₦1,500 | NGN |

### Admin Controls for Print Products
- Manage regions (add/edit/disable)
- Set regional pricing per product
- Manage fulfillment partners
- View print order status
- Handle print order issues/refunds
- Track fulfillment metrics
- Update shipping estimates
- Enable/disable products per region

---

## 3. User Management

### Photographer Management
- View all photographers (with search/filter)
- View photographer details:
  - Profile info
  - Events (count, status)
  - Total earnings
  - Payout history
  - Current balance
  - Wallet connections
- Actions:
  - Suspend account
  - Unsuspend account
  - Verify identity
  - Reset password
  - Delete account

### Attendee Management
- View all attendees
- View attendee details:
  - Profile info
  - FaceTag
  - Face profile status
  - Purchase history
  - Consents given
- Actions:
  - Suspend account
  - Delete face data
  - Export personal data (GDPR)

---

## 4. Transaction Management

### Transaction Overview
- View all transactions with filters
- Filter by: status, provider, event, photographer, date
- Search by transaction ID, email

### Transaction Details
- Full transaction breakdown:
  - Gross amount
  - Platform fee
  - Provider fee
  - Net to photographer
- Payment method details
- Associated entitlements
- Refund history

### Actions
- Issue full refund
- Issue partial refund
- View refund status
- Export transaction reports

---

## 5. Event Management

### Event Overview
- View all events with filters
- Filter by: status, photographer, date range
- Search by event name

### Event Details
- Event info and settings
- Photo count
- Face recognition usage
- Pricing configuration
- Transaction summary

### Actions
- Feature event (for public discovery)
- Suspend event
- Force close event
- Transfer ownership

---

## 6. Analytics Dashboard

### Revenue Metrics
- Total platform revenue (today, week, month, all-time)
- Revenue by provider
- Revenue by currency
- Average transaction value
- Transaction count

### Payout Metrics
- Total payouts (today, week, month, all-time)
- Payouts by provider
- Average payout size
- Payout success rate

### User Metrics
- New photographers (daily, weekly, monthly)
- New attendees
- Active users
- Churn rate

### Event Metrics
- New events created
- Active events
- Average photos per event
- Average face ops usage

### Charts
- Revenue over time
- User growth over time
- Payouts over time
- Transaction volume by hour/day

---

## 7. Support & Operations

### Audit Logs
- All admin actions logged
- Searchable by action type, admin, date
- Export capability

### Reports
- Generate financial reports
- Generate tax reports
- Generate user reports

### Announcements
- Send platform announcements
- Target: all users, photographers, attendees
- Channels: email, in-app notification

### Disputes
- View disputed transactions
- Manage chargeback responses
- Track dispute status

---

## 8. Access Control

### Admin Roles
- **Super Admin**: Full access to everything
- **Finance Admin**: Payouts, transactions, reports
- **Support Admin**: Users, events, support tickets
- **Read-only Admin**: View-only access

### Permissions
```typescript
const ADMIN_PERMISSIONS = {
  payouts: [
    'view_payout_queue',
    'process_single_payout',
    'process_batch_payouts',
    'retry_failed_payouts',
    'pause_global_payouts',
    'pause_photographer_payouts',
  ],
  settings: [
    'view_platform_settings',
    'update_platform_settings',
    'update_payout_minimums',
    'manage_currencies',
  ],
  users: [
    'view_photographers',
    'view_attendees',
    'suspend_user',
    'delete_user',
    'verify_user',
  ],
  transactions: [
    'view_transactions',
    'issue_refund',
    'export_reports',
  ],
  events: [
    'view_events',
    'suspend_event',
    'feature_event',
  ],
  analytics: [
    'view_revenue',
    'view_user_metrics',
    'export_analytics',
  ],
};
```

---

## 9. API Endpoints Needed

### Payouts
- `GET /api/admin/payouts` - View queue/history
- `POST /api/admin/payouts` - Process payouts
- `GET /api/admin/payouts/:id` - Payout details

### Settings
- `GET /api/admin/settings` - Get all settings
- `PUT /api/admin/settings/:key` - Update setting

### Users
- `GET /api/admin/photographers` - List photographers
- `GET /api/admin/photographers/:id` - Photographer details
- `PUT /api/admin/photographers/:id` - Update photographer
- `POST /api/admin/photographers/:id/suspend` - Suspend
- `GET /api/admin/attendees` - List attendees
- `GET /api/admin/attendees/:id` - Attendee details

### Transactions
- `GET /api/admin/transactions` - List transactions
- `GET /api/admin/transactions/:id` - Transaction details
- `POST /api/admin/transactions/:id/refund` - Issue refund

### Events
- `GET /api/admin/events` - List events
- `GET /api/admin/events/:id` - Event details
- `POST /api/admin/events/:id/suspend` - Suspend event

### Analytics
- `GET /api/admin/analytics/revenue` - Revenue stats
- `GET /api/admin/analytics/users` - User stats
- `GET /api/admin/analytics/events` - Event stats

### Audit
- `GET /api/admin/audit-logs` - View audit logs

---

## 10. Implementation Priority

### Phase 1 (MVP)
1. Payout queue view
2. Process batch payouts
3. View photographers
4. Basic transaction view

### Phase 2
1. Full payout management
2. Platform settings UI
3. User management actions
4. Transaction refunds

### Phase 3
1. Analytics dashboard
2. Audit logs
3. Role-based access
4. Reports export
