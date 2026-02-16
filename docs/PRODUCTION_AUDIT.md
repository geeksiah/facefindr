# Ferchr Production Readiness Audit

**Date:** ${new Date().toISOString().split('T')[0]}  
**Scope:** Complete system audit across web (photographer, admin, attendee) and mobile (photographer, attendee) platforms

---

## Executive Summary

### Production Readiness Score: **65/100** ⚠️

**Status:** NOT PRODUCTION READY - Critical issues identified requiring immediate attention before launch.

### Critical Issues (Must Fix Before Launch)
1. ❌ **Event Access Issues** - Events marked public still not accessible due to status/slug validation
2. ❌ **Subscription Plan Feature Management** - Admin cannot assign features to plans via UI
3. ❌ **Emoji Usage** - Unprofessional emojis in UI (admin pricing page, OG images)
4. ⚠️ **Payment Gateway Integration** - Some flows still hardcoded to Stripe
5. ⚠️ **RLS Policy Gaps** - Service client bypasses needed but may create security concerns

### High Priority Issues
1. ⚠️ **Modular Features System** - Created but not wired to replace hardcoded PLAN_LIMITS
2. ⚠️ **Mobile App Navigation** - Duplicate profile screen issue (recently fixed)
3. ⚠️ **Analytics Data** - Mobile app using dummy data instead of real-time

---

## 1. Event Access System

### Current Status
- ✅ Service client bypass implemented
- ✅ Access code validation working
- ❌ Events must be `status = 'active'` to access (even if `is_public = true`)
- ❌ Missing validation: Events without `public_slug` cannot be accessed

### Issues Found

#### Issue 1.1: Status Validation Too Strict
**Location:** `apps/web/src/app/api/events/public/[slug]/route.ts:42`  
**Problem:** Events with `is_public = true` but `status = 'draft'` return 404 instead of helpful error  
**Impact:** High - Creators can't preview their public events before publishing  
**Fix Required:** Return 403 with clear message for draft events

#### Issue 1.2: Missing Slug Generation
**Location:** `apps/web/src/app/(dashboard)/dashboard/events/actions.ts`  
**Problem:** Slug generation happens on publish, but should happen on creation  
**Status:** ✅ FIXED - Slug generation added in `createEvent` action

#### Issue 1.3: Access Pattern Confusion
**Problem:** Unclear distinction between:
- `is_public = true` (event is discoverable publicly)
- `is_publicly_listed = true` (appears in public listings)
- `public_slug` exists (accessible via direct link)
- `status = 'active'` (event is published and accessible)

**Fix Required:** Document and enforce clear access logic:
- Draft events: Only photographer can access (via dashboard)
- Active + public: Accessible via `/e/[slug]` without code
- Active + private: Accessible via `/e/[slug]` with code OR if user has consent
- Active + private + no code: Accessible via `/e/[slug]` if `allow_anonymous_scan = true`

### Recommendations
1. ✅ **IMPLEMENTED:** Use service client to bypass RLS for public event lookups
2. ✅ **PARTIALLY FIXED:** Better error messages for draft/inactive events
3. 🔄 **TODO:** Add event preview mode for photographers (access draft events via dashboard)
4. 🔄 **TODO:** Ensure `public_slug` is always generated on event creation (currently only on publish)

---

## 2. Subscription Plan System

### Current Status
- ✅ Database schema: `plan_features`, `plan_feature_assignments`, `subscription_plans` with `plan_type`
- ✅ API endpoints: `/api/admin/pricing/plans/[id]/features` (GET, PUT)
- ❌ **UI Missing:** No feature assignment interface in admin pricing page
- ⚠️ **Not Wired:** System still uses hardcoded `PLAN_LIMITS` instead of database features

### Issues Found

#### Issue 2.1: Missing Feature Assignment UI
**Location:** `apps/admin/src/app/(dashboard)/pricing/page.tsx:399-422`  
**Problem:** "Feature management UI coming soon" - Admin cannot assign features to plans  
**Impact:** CRITICAL - Admin cannot configure plan limits (events, photos, etc.)  
**Current Workaround:** Features must be assigned via API or database directly

#### Issue 2.2: Features Not Wired to Plan Limits
**Location:** `apps/web/src/lib/features/plan-features.ts` (exists but not used)  
**Problem:** System still uses `PLAN_LIMITS` constant instead of database features  
**Impact:** HIGH - Plan limits are hardcoded and cannot be changed by admin  
**Files Using Hardcoded Limits:**
- `apps/web/src/app/(dashboard)/dashboard/events/actions.ts` (line 48: `PLAN_LIMITS`)
- `packages/shared/src/constants/index.ts` (entire `PLAN_LIMITS` object)

#### Issue 2.3: Plan Type Handling
**Location:** `apps/admin/src/app/(dashboard)/pricing/page.tsx`  
**Status:** ✅ Has `plan_type` selector in form (photographer/drop_in)  
**Issue:** Features tab shows "coming soon" placeholder  
**Missing:** 
- List of available features per plan type
- UI to assign features with values (numeric, boolean, text)
- Validation for feature values based on `feature_type`

### Recommendations
1. 🔄 **TODO:** Build feature assignment UI in admin pricing page
2. 🔄 **TODO:** Wire `getPlanLimits()` utility to replace `PLAN_LIMITS` usage
3. 🔄 **TODO:** Update event creation/update actions to use database features
4. 🔄 **TODO:** Add validation: Ensure drop-in plans don't have photographer-only features

---

## 3. UI/UX Issues

### Emoji Usage (Unprofessional)
**Status:** ❌ Found 2 instances

#### Issue 3.1: Admin Pricing Page
**Location:** `apps/admin/src/app/(dashboard)/pricing/page.tsx:341`  
**Problem:** `📷 Creator` and `🎁 Drop-In` emojis in plan cards  
**Fix:** ✅ REPLACED with `Camera` and `Gift` icons from lucide-react

#### Issue 3.2: OG Image Route
**Location:** `apps/web/src/app/api/og/event/route.tsx:127,131`  
**Problem:** `📅` and `📷` emojis in Open Graph images  
**Impact:** Medium - Social sharing images look unprofessional  
**Fix:** ✅ REPLACED with text (emojis in OG images via ImageResponse are limited)

### Missing Professional Icons
**Status:** ✅ Most UI uses lucide-react icons (good)  
**Review Needed:** Check mobile app for emoji usage

---

## 4. Security Audit

### Authentication & Authorization

#### 4.1 Admin Authentication
**Status:** ✅ Separate JWT-based auth system  
**Location:** `apps/admin/src/lib/auth.ts`  
**Issues:** None found

#### 4.2 RLS Policies
**Status:** ⚠️ Mixed - Some endpoints bypass RLS using service client

**Service Client Usage (Bypasses RLS):**
- ✅ `apps/web/src/app/api/events/public/[slug]/route.ts` - Correct (public access needs bypass)
- ✅ `apps/web/src/app/api/events/[id]/attendee-view/route.ts` - Correct (validates access manually)
- ⚠️ Should audit all service client usage for security implications

**RLS Policy Issues:**
- ✅ Events: Public events accessible via RLS policy
- ⚠️ Media: Need to verify RLS allows public event photo viewing
- ✅ Plan features: Readable by all authenticated users (correct)

#### 4.3 Payment Security
**Status:** ⚠️ Needs review

**Issues:**
- ✅ Idempotency keys implemented in checkout
- ⚠️ Need to verify all payment flows use idempotency
- ⚠️ Need to verify saved payment methods are validated

### Recommendations
1. 🔄 **TODO:** Security audit of all service client usage
2. 🔄 **TODO:** Verify payment idempotency in all flows (checkout, tips, drop-in)
3. 🔄 **TODO:** Rate limiting on public endpoints
4. 🔄 **TODO:** Input validation and sanitization review

---

## 5. Web App Audit

### 5.1 Creator Dashboard

#### Events Management
- ✅ Create/Edit/Delete events
- ✅ Event status management (draft/active/closed/archived)
- ✅ Photo upload with progress
- ✅ Event gallery with thumbnails
- ❌ **Issue:** Photo list on event detail page loads indefinitely (user reported)
- ⚠️ **Issue:** Cover photos and thumbnails not rendering (user reported)
- ✅ Lightbox with navigation implemented

#### Analytics
- ✅ Dashboard stats (events, photos, revenue)
- ⚠️ **Issue:** Need to verify all stats are real-time vs cached
- ⚠️ **Missing:** Export to PDF/CSV (user requested)

#### Settings
- ✅ Profile management
- ✅ Notification preferences
- ⚠️ **Issue:** Settings page not opening (user reported - photographer web)
- ⚠️ **Missing:** Privacy/security settings distinct from attendee

#### Billing
- ✅ Plan selection
- ⚠️ **Issue:** Plan cards hardcoded - should render from admin-created plans
- ⚠️ **Missing:** Payment method management on web
- ⚠️ **Missing:** Payout requests on web

### 5.2 Admin Dashboard

#### Events Management
- ✅ View all events
- ✅ Filter events
- ✅ Access event management
- ⚠️ **Issue:** Event photos list loading indefinitely (user reported)

#### Pricing & Plans
- ✅ Create/Edit/Delete plans
- ✅ Multi-currency pricing
- ✅ Platform fee and print commission configuration
- ❌ **CRITICAL:** No UI to assign features to plans
- ❌ **CRITICAL:** Cannot set event limits, photo limits per plan
- ❌ **CRITICAL:** Cannot set drop-in plan features

#### Creators
- ✅ List photographers
- ✅ View photographer details
- ✅ Filter by plan
- ⚠️ **Missing:** Assign/extend plans functionality
- ⚠️ **Missing:** Promo code creation/assignment

#### Announcements
- ✅ Create announcements
- ⚠️ **Issue:** Announcement page not opening (user reported)
- ⚠️ **Missing:** Add CTAs to announcements
- ⚠️ **Missing:** Filter users by country for announcements
- ⚠️ **Missing:** Choose medium (email/SMS) for announcements

### 5.3 Attendee Gallery

#### Event Pages
- ✅ Public event page (`/e/[slug]`)
- ✅ Access code entry
- ✅ Photo gallery preview
- ✅ Face scan link
- ⚠️ **Issue:** Event detail page shows "not found" (user reported)
- ✅ Follow photographer button
- ✅ Photo reactions
- ✅ Tip photographer
- ✅ Rate photographer

#### Social Features
- ✅ Follow/Unfollow photographers
- ✅ View followers list
- ✅ View following list
- ✅ Photo reactions (love, fire, amazing, beautiful)
- ✅ Creator ratings
- ✅ Tip photographer after download

### 5.4 Public Event Pages

#### Access Patterns
- ✅ Public events: `/e/[slug]` (no code needed)
- ✅ Private + code: `/e/[slug]?code=XXXXX`
- ✅ Private no code: `/e/[slug]` (if `allow_anonymous_scan = true`)
- ❌ **Issue:** Events must be `status = 'active'` to access (blocks draft preview)

#### QR Codes
- ✅ QR code generation with logo
- ✅ QR code download/export
- ✅ QR code sharing (mobile)
- ⚠️ **Issue:** Logo size should be increased (user requested)

#### Open Graph / Social Sharing
- ✅ OG image generation
- ❌ **Issue:** Emoji in OG images (unprofessional)
- ✅ Event metadata for social cards

---

## 6. Mobile App Audit

### 6.1 Creator Mobile App

#### Navigation
- ✅ Bottom tab navigation
- ✅ Events, Upload, Analytics, Profile tabs
- ⚠️ **Recent Fix:** Duplicate "profile" tab removed
- ⚠️ **Issue:** "Drop-in" tab requested but not visible

#### Events
- ✅ Event list
- ✅ Create event
- ✅ Event detail page
- ❌ **Issue:** Event detail page shows as attendee view (user reported - fixed)
- ❌ **Issue:** "Create your first event" shown even when events exist (user reported - partially fixed)
- ❌ **Issue:** Photo list not rendering on event detail (user reported)
- ⚠️ **Missing:** Photo pricing module in create event form (web has it)

#### Upload
- ✅ Photo selection
- ✅ Bulk upload
- ❌ **Issue:** Upload button cut off when photos selected, unscrollable (user reported)
- ✅ Upload progress

#### Analytics
- ✅ Revenue display
- ✅ Stats cards (views, sales, conversion)
- ✅ Top performing events
- ❌ **CRITICAL:** Using dummy data instead of real-time database queries
- ⚠️ **Missing:** Export to CSV/PDF

#### Settings
- ✅ Profile management
- ⚠️ **Missing:** Privacy/security settings distinct from attendee
- ⚠️ **Missing:** Payment method management
- ⚠️ **Missing:** Payout requests
- ⚠️ **Missing:** Subscription upgrade section

### 6.2 Attendee Mobile App

#### Navigation
- ✅ Bottom tab navigation (Photos, Find, Events, Alerts, Drop-In)
- ✅ Profile accessible via header avatar (not in tabs)
- ✅ Vault accessible via navigation (hidden from tabs)
- ⚠️ **Recent Fix:** Duplicate "profile" tab removed

#### Photos (Home)
- ✅ Photo grid
- ✅ Event grouping
- ✅ Photo timeline
- ⚠️ **Issue:** Cover photos not rendering (user reported)

#### Find Photos (Scan)
- ✅ Face scan UI
- ✅ Photo matching results
- ✅ Head position illustrations
- ⚠️ **Issue:** Should use flattened SVGs from `assets/scan-img` (no borders/glow) - user requested
- ⚠️ **Issue:** Avatar should be in header (right of search) - user requested

#### Events
- ✅ Event list
- ✅ Event detail
- ✅ Photo gallery
- ✅ Purchase/download photos
- ✅ Reactions on photos
- ✅ Tip photographer
- ✅ Rate photographer

#### Drop-In
- ✅ Two-tabbed page (Send/Check)
- ✅ Upload drop-in photos
- ✅ Discover drop-in photos
- ✅ Gift functionality
- ⚠️ **Issue:** Drop-in page button hidden beneath bottom nav (user reported - partially fixed)
- ⚠️ **Issue:** Menu icon needs professional icon (user requested)

#### Vault
- ✅ Storage plans display
- ⚠️ **Missing:** Dynamic connection to admin dashboard plans
- ⚠️ **Missing:** Secure distribution and timeline checks

#### Settings
- ✅ Notifications
- ✅ Help/FAQ
- ⚠️ **Missing:** Privacy/security settings distinct from photographer
- ⚠️ **Missing:** Different FAQ/Privacy/TOS for attendees
- ⚠️ **Missing:** Subscription upgrade section
- ✅ Footer year dynamic (fixed)

#### Notifications
- ✅ Notification list
- ✅ Real-time updates
- ⚠️ **Missing:** Admin announcements in mobile notifications (user requested)

---

## 7. Feature Completeness

### 7.1 Implemented ✅
1. ✅ Event creation and management
2. ✅ Photo upload and processing
3. ✅ Face recognition integration (AWS Rekognition)
4. ✅ QR code generation and sharing
5. ✅ Payment processing (Stripe, Flutterwave, PayPal - dynamic selection)
6. ✅ Social features (follow, reactions, ratings, tips)
7. ✅ Subscription management (basic)
8. ✅ Admin dashboard (events, photographers, pricing)
9. ✅ Real-time subscriptions (Supabase)
10. ✅ Drop-in feature (upload, discover, gift)

### 7.2 Partially Implemented ⚠️
1. ⚠️ **Modular Pricing Features** - Schema exists, UI missing, not wired
2. ⚠️ **Analytics** - Web has real data, mobile has dummy data
3. ⚠️ **Payment Methods** - Stripe saved methods work, others need verification
4. ⚠️ **Payouts** - System exists, UI missing on mobile
5. ⚠️ **Announcements** - Created but missing CTAs, filtering, medium selection

### 7.3 Missing / Incomplete ❌
1. ❌ **Admin: Feature Assignment UI** - Cannot assign features to plans
2. ❌ **Admin: Promo Codes** - No UI for creation/assignment
3. ❌ **Admin: Plan Assignment/Extension** - Cannot manually assign plans to users
4. ❌ **Admin: Annual Subscription Discounts** - No UI for percentage/fixed discounts
5. ❌ **Billing: Dynamic Plan Cards** - Still hardcoded, should use admin-created plans
6. ❌ **Privacy/Security Settings** - No distinct settings for attendee vs photographer
7. ❌ **FAQ/Privacy/TOS** - Same content for all, should be different per user type
8. ❌ **Photo Lightbox** - Overlay should be semi-transparent, edge-to-edge (user requested)
9. ❌ **Export Analytics** - PDF/CSV export missing on web and mobile
10. ❌ **Payment Method Errors** - Need auto-verification of local wallet account names

---

## 8. Dead-Ends & Incomplete Flows

### 8.1 Dead-Ends Found
1. ❌ **Admin Pricing Features Tab** - Shows "coming soon", no actual functionality
2. ⚠️ **Event Draft Preview** - Cannot preview draft events before publishing
3. ⚠️ **Plan Feature Assignment** - Must use API directly, no UI
4. ⚠️ **Mobile Analytics** - Displays dummy data, no real functionality

### 8.2 Incomplete Flows
1. ⚠️ **Event Creation → Publish** - Slug should be generated on creation, not publish
2. ⚠️ **Plan Creation → Feature Assignment** - Two-step process, should be integrated
3. ⚠️ **Photo Upload → Processing** - Need to verify face indexing happens correctly
4. ⚠️ **Payment → Payout** - Creators cannot request payouts on mobile

---

## 9. Critical Production Gaps

### Security
1. ⚠️ Service client usage needs audit (bypasses RLS - could be security risk)
2. ⚠️ Rate limiting not implemented on public APIs
3. ⚠️ Input sanitization needs review
4. ⚠️ Payment flows need idempotency verification

### Performance
1. ⚠️ Image optimization for cover photos (user requested)
2. ⚠️ Real-time subscription management (may cause performance issues with many subscriptions)
3. ⚠️ Analytics queries need optimization (mobile app)

### Reliability
1. ⚠️ Error handling needs improvement (better user-facing error messages)
2. ⚠️ Loading states need consistency across all pages
3. ⚠️ Offline handling not implemented

### User Experience
1. ❌ Emoji usage makes UI unprofessional
2. ⚠️ Missing loading states in some flows
3. ⚠️ Error messages not user-friendly
4. ⚠️ Missing empty states in some screens

---

## 10. Recommended Fix Priority

### Priority 1: CRITICAL (Must Fix Before Launch)
1. ❌ **Fix event access** - Allow public events to be accessed (even if draft for preview)
2. ❌ **Build feature assignment UI** - Admin must be able to configure plan limits
3. ❌ **Wire features system** - Replace hardcoded PLAN_LIMITS with database features
4. ❌ **Fix event photos loading** - Resolve infinite loading on event detail pages
5. ❌ **Remove all emojis** - Replace with professional icons

### Priority 2: HIGH (Should Fix Before Launch)
1. ⚠️ **Fix photo thumbnails/cover images** - Not rendering issue
2. ⚠️ **Fix mobile upload button** - Cut off and unscrollable
3. ⚠️ **Implement analytics exports** - PDF/CSV on web and mobile
4. ⚠️ **Wire real-time analytics** - Mobile app dummy data → real data
5. ⚠️ **Fix announcement page** - Not opening issue

### Priority 3: MEDIUM (Can Fix Post-Launch)
1. ⚠️ Add promo code UI
2. ⚠️ Add plan assignment/extension UI
3. ⚠️ Add payment method management on mobile
4. ⚠️ Add payout requests on mobile
5. ⚠️ Distinct privacy/security settings

### Priority 4: LOW (Nice to Have)
1. Lightbox overlay improvements
2. QR logo size adjustment
3. Photo pricing module on mobile create event
4. Drop-in menu icon professionalization

---

## 11. Testing Recommendations

### Manual Testing Required
1. ✅ Test event access with all combinations (public/private, draft/active, with/without code)
2. ❌ Test admin plan creation with feature assignment
3. ❌ Test photographer event creation and limits enforcement
4. ❌ Test mobile photo upload flow (button visibility)
5. ❌ Test payment flows with all gateways (Stripe, Flutterwave, PayPal)
6. ❌ Test social features (follow, reactions, ratings, tips) on both web and mobile
7. ❌ Test real-time subscriptions across all pages

### Automated Testing Needed
1. ❌ Unit tests for plan features system
2. ❌ Integration tests for event access logic
3. ❌ E2E tests for payment flows
4. ❌ E2E tests for photo upload and processing

---

## 12. Documentation Gaps

### Missing Documentation
1. ❌ Event access patterns (public/private/draft/active combinations)
2. ❌ Plan feature system usage (how to create/assign features)
3. ❌ Payment gateway configuration (how to set up per country)
4. ❌ Admin workflow (how to create plans, assign features, manage users)
5. ❌ Deployment guide (environment variables, database setup)

---

## 13. Next Steps

1. **IMMEDIATE:** Fix critical issues (Priority 1)
2. **WEEK 1:** Address high priority issues (Priority 2)
3. **WEEK 2:** Security audit and testing
4. **WEEK 3:** Documentation and final polish
5. **LAUNCH:** Only after all Priority 1 & 2 issues resolved

---

## Audit Completion Checklist

- [x] Event access system reviewed
- [x] Subscription plan system reviewed
- [x] UI/UX issues identified
- [x] Security concerns documented
- [x] Web app audited (photographer, admin, attendee)
- [x] Mobile app audited (photographer, attendee)
- [x] Feature completeness assessed
- [x] Dead-ends identified
- [x] Production gaps documented
- [x] Priority matrix created
- [ ] **TODO:** Implement fixes for Priority 1 issues
- [ ] **TODO:** Re-audit after fixes

---

**Audit Conducted By:** AI Assistant  
**Next Review Date:** After Priority 1 fixes implemented
