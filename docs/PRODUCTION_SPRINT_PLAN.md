# FaceFind Production Sprint Plan

> **Goal:** 100% SRS compliance for production-grade release  
> **Total Sprints:** 8  
> **Status:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete

---

## Sprint 1: Face Profile Smart Refresh System
**Priority:** Critical | **SRS Reference:** §3.3.2

### Tasks
- [ ] **1.1** Add `face_embeddings` table for storing multiple embeddings per user
- [ ] **1.2** Create passive embedding collection - save every successful event face scan
- [ ] **1.3** Add `match_confidence_log` table for 90-day rolling average tracking
- [ ] **1.4** Create confidence monitoring background job (check if avg < 75%)
- [ ] **1.5** Build refresh prompt UI component (Update My Photo / These Are Me / Not Me)
- [ ] **1.6** Implement age-based refresh schedule logic:
  - Under 13: Every 6 months (required)
  - 13-18: Every 9 months (strong prompt)
  - 18-25: Every 12 months (soft prompt)
  - 25-50: Every 18 months (soft prompt)
  - 50+: Every 24 months (soft prompt)
- [ ] **1.7** Add DOB field to attendee profile for age-based refresh
- [ ] **1.8** Self-declared appearance changes flow:
  - New hairstyle, facial hair, new glasses, weight change options
  - "Add to Profile" vs "Replace Profile" choice
  - Temporary change option (costumes/makeup)
- [ ] **1.9** Update face matching algorithm to use all stored embeddings with recency weighting

### Database Migrations
```sql
-- 018_face_profile_refresh.sql
- face_embeddings table
- match_confidence_log table
- refresh_prompts table
- user age/DOB field
```

### API Endpoints
- `POST /api/faces/embeddings` - Add supplementary embedding
- `GET /api/faces/refresh-status` - Check if refresh needed
- `POST /api/faces/refresh` - Update face profile
- `POST /api/faces/appearance-change` - Log appearance change

---

## Sprint 2: Liveness Detection & Multi-Angle Capture
**Priority:** Critical | **SRS Reference:** §3.3.1

### Tasks
- [ ] **2.1** Integrate AWS Rekognition liveness detection API
- [ ] **2.2** Update face scan flow to require liveness check before processing
- [ ] **2.3** Implement multi-angle capture prompts:
  - Center face detection
  - "Turn head slightly left" prompt
  - "Turn head slightly right" prompt  
  - "Tilt head up slightly" prompt
  - "Look straight" final capture
- [ ] **2.4** Store 3-5 angle embeddings as primary face profile
- [ ] **2.5** Add liveness failure handling with user-friendly messages
- [ ] **2.6** Mobile: Update `face-scan.tsx` with guided capture UI
- [ ] **2.7** Web: Update `guided-face-scanner.tsx` with multi-angle flow
- [ ] **2.8** Add retry logic with exponential backoff for failed liveness checks

### Dependencies
- AWS Rekognition Face Liveness API (requires additional setup)

---

## Sprint 3: Photo Drop & Live Event Mode
**Priority:** Critical | **SRS Reference:** §6.4-6.5

### Tasks
- [ ] **3.1** Add `live_event_mode` boolean to events table
- [ ] **3.2** Add Live Event Mode toggle in photographer event dashboard
- [ ] **3.3** Create photo upload webhook that triggers match notifications
- [ ] **3.4** Implement batch matching on upload:
  - On photo upload, detect faces
  - Match against all registered attendees in event
  - Queue notifications for matched attendees
- [ ] **3.5** Notification throttling system:
  - Max 1 push per event per attendee per hour
  - Aggregate multiple uploads into single notification
  - Respect device quiet hours
- [ ] **3.6** Live Mode notification timing:
  - Standard mode: Within 5 minutes
  - Live mode: Within 2 minutes (priority queue)
- [ ] **3.7** Notification content format:
  - Event name
  - New photo count
  - Matched photo count
  - Deep link to matched photos
- [ ] **3.8** Add `notification_queue` table with priority levels
- [ ] **3.9** Create notification worker (cron job or edge function)
- [ ] **3.10** Mobile deep link handling for photo drop notifications

### Database Migrations
```sql
-- 019_photo_drop_system.sql
- events.live_event_mode column
- notification_queue table
- notification_throttle_log table
```

### API Endpoints
- `POST /api/events/[id]/live-mode` - Toggle live mode
- `POST /api/notifications/photo-drop` - Internal trigger endpoint
- `GET /api/notifications/queue` - Admin view of queue

---

## Sprint 4: Print Product Sales
**Priority:** Critical | **SRS Reference:** §7.4

### Tasks
- [ ] **4.1** Create print product catalog UI:
  - Photo Prints: 4x6, 5x7, 8x10, 11x14
  - Canvas: 8x10, 12x16, 16x20, 24x36
  - Photo Books: 20, 40, 60 pages
  - Metal Prints: 8x10, 12x16, 16x20
- [ ] **4.2** Build "Print This Photo" button on photo detail view
- [ ] **4.3** Product selection modal with:
  - Size options
  - Material options
  - Preview mockup
  - Price display (region-aware)
- [ ] **4.4** Shipping address collection form:
  - Name, address, city, state/province, postal code, country
  - Address validation
  - Save address option for registered users
- [ ] **4.5** Print checkout flow through platform Stripe account
- [ ] **4.6** Create `print_orders` table:
  - Order status tracking
  - Product details
  - Shipping info
  - Fulfillment partner assignment
- [ ] **4.7** Order confirmation email with details
- [ ] **4.8** Order status page for customers
- [ ] **4.9** Admin order management dashboard
- [ ] **4.10** Fulfillment partner integration (API or manual export)
- [ ] **4.11** Tracking number webhook and email notification
- [ ] **4.12** Mobile: Print order flow screens

### Database Migrations
```sql
-- 020_print_orders.sql
- print_orders table
- print_order_items table  
- shipping_addresses table
```

### API Endpoints
- `POST /api/prints/order` - Create print order
- `GET /api/prints/orders` - List user orders
- `GET /api/prints/orders/[id]` - Order details
- `POST /api/prints/orders/[id]/tracking` - Update tracking

---

## Sprint 5: Security Hardening
**Priority:** Critical | **SRS Reference:** §10

### Tasks
- [ ] **5.1** Rate limiting on login:
  - 5 failed attempts → 15-minute lockout
  - Track by IP + email combination
  - Store in Redis or database
- [ ] **5.2** Two-factor authentication for photographers:
  - TOTP setup flow (Google Authenticator, Authy)
  - QR code display for setup
  - Backup codes generation (10 codes)
  - 2FA verification on login
  - 2FA management in settings (enable/disable/regenerate)
- [ ] **5.3** Mobile certificate pinning:
  - Pin API domain certificates
  - Implement in React Native HTTP client
- [ ] **5.4** Jailbreak/root detection:
  - Detect jailbroken iOS devices
  - Detect rooted Android devices
  - Show warning but allow continued use
- [ ] **5.5** Session security improvements:
  - Verify session tokens are 256+ bits
  - Implement session invalidation on password change
- [ ] **5.6** Add security audit logging:
  - Log all auth events
  - Log consent grants/withdrawals
  - Log admin data access
- [ ] **5.7** Biometric unlock for mobile app (Face ID/Touch ID)

### Database Migrations
```sql
-- 021_security_hardening.sql
- login_attempts table
- totp_secrets table
- backup_codes table
- security_audit_log table
```

### API Endpoints
- `POST /api/auth/2fa/setup` - Initialize 2FA
- `POST /api/auth/2fa/verify` - Verify TOTP code
- `POST /api/auth/2fa/disable` - Disable 2FA
- `GET /api/auth/2fa/backup-codes` - Get backup codes

---

## Sprint 6: Legal Documents & Compliance
**Priority:** Critical | **SRS Reference:** §12.2

### Tasks
- [ ] **6.1** Draft Terms of Service (photographers)
  - Subscription terms
  - Payment terms
  - Content ownership
  - Liability limitations
- [ ] **6.2** Draft Terms of Use (attendees)
  - Account usage
  - Photo access rights
  - Prohibited activities
- [ ] **6.3** Draft Privacy Policy
  - Data collection practices
  - Data usage
  - Third-party sharing
  - User rights (GDPR, CCPA)
- [ ] **6.4** Draft Biometric Data Policy
  - BIPA compliance (Illinois)
  - What biometric data is collected
  - How it's stored and protected
  - Retention and destruction schedule
  - No sale of biometric data
- [ ] **6.5** Draft Cookie Policy
  - Types of cookies used
  - Third-party cookies
  - How to manage cookies
- [ ] **6.6** Draft DMCA/Copyright Policy
  - Takedown procedures
  - Counter-notification process
  - Repeat infringer policy
- [ ] **6.7** Create legal pages in web app:
  - `/legal/terms-photographers`
  - `/legal/terms-attendees`
  - `/legal/privacy`
  - `/legal/biometric`
  - `/legal/cookies`
  - `/legal/dmca`
- [ ] **6.8** Add consent checkboxes at registration
- [ ] **6.9** Version tracking for legal documents
- [ ] **6.10** Re-consent flow when documents update

### Pages to Create
- `apps/web/src/app/legal/terms-photographers/page.tsx`
- `apps/web/src/app/legal/terms-attendees/page.tsx`
- `apps/web/src/app/legal/privacy/page.tsx`
- `apps/web/src/app/legal/biometric/page.tsx`
- `apps/web/src/app/legal/cookies/page.tsx`
- `apps/web/src/app/legal/dmca/page.tsx`

---

## Sprint 7: Engagement Features
**Priority:** High | **SRS Reference:** §6.6-6.7

### Tasks
- [ ] **7.1** Memory Resurfacing:
  - Anniversary notification system ("One year ago you were at...")
  - Cron job to check for anniversaries daily
  - Link to print products for memories
  - Notification preferences for memory alerts
- [ ] **7.2** Photo Reactions:
  - One-tap reaction on photo view/download
  - Reaction types: ❤️ Love, 🔥 Fire, 👏 Amazing, 😍 Beautiful
  - Store reactions in database
  - Aggregate reactions for photographer dashboard
- [ ] **7.3** Reaction notifications for photographers:
  - Batch reactions (don't spam)
  - Daily/weekly summary option
- [ ] **7.4** Tipping system:
  - Optional tip prompt after download
  - Preset amounts: $2, $5, $10
  - Custom amount option
  - Process through Stripe Connect (to photographer)
- [ ] **7.5** Photo Passport enhancements:
  - NFC tap-to-share (where supported)
  - CSV import for FaceTag pre-registration
  - Bulk FaceTag validation
- [ ] **7.6** Follow photographer notifications for public events

### Database Migrations
```sql
-- 022_engagement_features.sql
- photo_reactions table
- tips table
- memory_notifications table
- facetag_imports table
```

### API Endpoints
- `POST /api/photos/[id]/react` - Add reaction
- `POST /api/tips` - Process tip
- `POST /api/events/[id]/import-facetags` - Import CSV
- `GET /api/memories` - Get memory notifications

---

## Sprint 8: App Store Preparation
**Priority:** Critical | **SRS Reference:** §13

### Tasks
- [ ] **8.1** iOS App Store:
  - [ ] App Store Connect account setup
  - [ ] App icons (all required sizes)
  - [ ] Screenshots for all device sizes
  - [ ] App description and keywords
  - [ ] Privacy nutrition labels (accurate!)
  - [ ] Sign in with Apple implementation
  - [ ] StoreKit integration for subscriptions
  - [ ] TestFlight beta testing
  - [ ] App Store review submission
- [ ] **8.2** Android Play Store:
  - [ ] Google Play Console setup
  - [ ] App icons and feature graphics
  - [ ] Screenshots for phone and tablet
  - [ ] Store listing description
  - [ ] Data safety form (accurate!)
  - [ ] Google Play Billing integration
  - [ ] Internal testing track
  - [ ] Production release submission
- [ ] **8.3** Both platforms:
  - [ ] Age rating questionnaire
  - [ ] Content rating
  - [ ] Target API level compliance (Android)
  - [ ] Export compliance (encryption)
  - [ ] Biometric data disclosure
- [ ] **8.4** Pre-submission checklist:
  - [ ] All legal documents live
  - [ ] Privacy policy URL in app
  - [ ] Terms of service URL in app
  - [ ] Contact email/support URL
  - [ ] No placeholder content
  - [ ] All features functional
  - [ ] Crash-free testing
- [ ] **8.5** Post-submission:
  - [ ] Monitor review status
  - [ ] Respond to reviewer questions
  - [ ] Address rejections promptly

---

## Quick Reference: All Database Migrations

| Migration | Sprint | Description |
|-----------|--------|-------------|
| 018_face_profile_refresh.sql | 1 | Face embeddings, confidence tracking |
| 019_photo_drop_system.sql | 3 | Live mode, notification queue |
| 020_print_orders.sql | 4 | Print orders, shipping |
| 021_security_hardening.sql | 5 | 2FA, rate limiting, audit logs |
| 022_engagement_features.sql | 7 | Reactions, tips, memories |

---

## Quick Reference: All New API Endpoints

| Endpoint | Sprint | Method | Description |
|----------|--------|--------|-------------|
| `/api/faces/embeddings` | 1 | POST | Add supplementary embedding |
| `/api/faces/refresh-status` | 1 | GET | Check refresh needed |
| `/api/faces/refresh` | 1 | POST | Update face profile |
| `/api/faces/appearance-change` | 1 | POST | Log appearance change |
| `/api/events/[id]/live-mode` | 3 | POST | Toggle live mode |
| `/api/notifications/photo-drop` | 3 | POST | Trigger photo drop |
| `/api/prints/order` | 4 | POST | Create print order |
| `/api/prints/orders` | 4 | GET | List orders |
| `/api/prints/orders/[id]` | 4 | GET | Order details |
| `/api/prints/orders/[id]/tracking` | 4 | POST | Update tracking |
| `/api/auth/2fa/setup` | 5 | POST | Initialize 2FA |
| `/api/auth/2fa/verify` | 5 | POST | Verify TOTP |
| `/api/auth/2fa/disable` | 5 | POST | Disable 2FA |
| `/api/auth/2fa/backup-codes` | 5 | GET | Get backup codes |
| `/api/photos/[id]/react` | 7 | POST | Add reaction |
| `/api/tips` | 7 | POST | Process tip |
| `/api/events/[id]/import-facetags` | 7 | POST | Import CSV |
| `/api/memories` | 7 | GET | Memory notifications |

---

## Progress Tracker

| Sprint | Name | Status | Completion |
|--------|------|--------|------------|
| 1 | Face Profile Smart Refresh | 🔴 | 0% |
| 2 | Liveness Detection | 🔴 | 0% |
| 3 | Photo Drop & Live Mode | 🔴 | 0% |
| 4 | Print Product Sales | 🔴 | 0% |
| 5 | Security Hardening | 🔴 | 0% |
| 6 | Legal Documents | 🔴 | 0% |
| 7 | Engagement Features | 🔴 | 0% |
| 8 | App Store Preparation | 🔴 | 0% |

---

## Notes

- **Sprint order is optimized for dependencies** - Security and legal should be done before app store submission
- **Sprints 1-5 can be parallelized** if multiple developers available
- **Sprint 6 requires legal review** - budget time for lawyer consultation
- **Sprint 8 depends on ALL previous sprints** - don't submit until 100% ready
- **App Store review typically takes 1-7 days** - factor into launch timeline

---

*Last Updated: January 14, 2026*
