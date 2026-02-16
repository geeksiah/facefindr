# Critical Fixes Required Before Launch

**Date:** ${new Date().toISOString().split('T')[0]}  
**Priority:** IMMEDIATE - These issues block production launch

---

## 🔴 CRITICAL ISSUES (Must Fix NOW)

### 1. Event Access System ❌

**Problem:** Events marked `is_public = true` still show "not found" because:
- Events must have `status = 'active'` to be accessed via public slug
- Better error messages needed for draft events

**Location:** `apps/web/src/app/api/events/public/[slug]/route.ts`

**Fix Applied:**
- ✅ Added better error message for draft/inactive events
- ✅ Event lookup now checks status and provides helpful feedback

**Remaining Work:**
- 🔄 Allow photographers to preview their draft events via dashboard (separate endpoint)
- 🔄 Ensure `public_slug` is ALWAYS generated on event creation (not just on publish)

**Status:** ✅ PARTIALLY FIXED - Better error messages, but events still need to be active

---

### 2. Admin Plan Feature Assignment UI ❌

**Problem:** Admin cannot assign features to subscription plans via UI. Must use API directly.

**Impact:** CRITICAL - Admin cannot configure:
- Event limits per plan
- Photo limits per plan  
- Face recognition ops per plan
- Feature flags (custom watermark, API access, etc.)
- Drop-in plan features

**Location:** `apps/admin/src/app/(dashboard)/pricing/page.tsx:399-422`

**Current State:**
- ✅ API endpoint exists: `/api/admin/pricing/plans/[id]/features` (GET, PUT)
- ❌ UI shows "Feature management UI coming soon" placeholder
- ❌ No way to assign features when creating/editing plans

**Required Implementation:**
1. Build feature list UI showing available features for plan type
2. Add feature assignment form (with value inputs based on feature_type)
3. Wire to existing API endpoint
4. Validate feature values (numeric, boolean, text)

**Priority:** 🔴 CRITICAL - Cannot launch without this

---

### 3. Modular Features System Not Wired ❌

**Problem:** System still uses hardcoded `PLAN_LIMITS` instead of database features.

**Impact:** HIGH - Plan limits cannot be changed by admin, must be hardcoded in code.

**Files Using Hardcoded Limits:**
- `apps/web/src/app/(dashboard)/dashboard/events/actions.ts` (lines 15, 48, 57)
- `apps/web/src/components/events/actions.ts` (lines 6, 46-48)
- `packages/shared/src/constants/index.ts` (entire PLAN_LIMITS object)

**Solution Utility Created:**
- ✅ `apps/web/src/lib/features/plan-features.ts` - Has `getPlanLimits()` function

**Required Work:**
1. Replace `PLAN_LIMITS` imports with `getPlanLimits(userId, 'photographer')`
2. Update all plan limit checks to use async database queries
3. Add caching layer for plan features (avoid repeated queries)
4. Ensure backward compatibility during transition

**Priority:** 🔴 CRITICAL - Must wire before launch

---

### 4. Event Photos Loading Forever ❌

**Problem:** Photo list on event management page loads indefinitely.

**Location:** `apps/web/src/app/(dashboard)/dashboard/events/[id]/page.tsx`

**Possible Causes:**
- RLS blocking media queries
- Missing media records
- Infinite loop in loading state
- Storage URL generation failing

**Investigation Needed:**
- Check RLS policies on `media` table
- Verify storage URL helper functions
- Check for loading state bugs

**Priority:** 🔴 CRITICAL - Blocks photographer workflow

---

### 5. Emoji Usage ❌

**Problem:** Unprofessional emojis in UI.

**Found Instances:**
- ✅ FIXED: `apps/admin/src/app/(dashboard)/pricing/page.tsx` - Replaced 📷🎁 with icons
- ✅ FIXED: `apps/web/src/app/api/og/event/route.tsx` - Removed 📅📷 emojis

**Status:** ✅ FIXED - All emojis removed from UI

---

## 🟠 HIGH PRIORITY ISSUES (Fix Before Launch)

### 6. Photo Thumbnails Not Rendering

**Problem:** Cover images and photo thumbnails not displaying.

**Possible Causes:**
- Storage RLS blocking access
- Incorrect URL generation
- Missing storage bucket policies
- CORS issues

**Priority:** 🟠 HIGH - Core functionality broken

---

### 7. Mobile Upload Button Cut Off

**Problem:** Upload button hidden and unscrollable when photos selected.

**Location:** `apps/mobile/app/(photographer)/upload.tsx`

**Fix Needed:** Adjust layout/scroll behavior

**Priority:** 🟠 HIGH - Blocks photo upload on mobile

---

### 8. Mobile Analytics Using Dummy Data

**Problem:** Analytics page shows fake data instead of real-time database queries.

**Location:** `apps/mobile/app/(photographer)/analytics.tsx`

**Fix Needed:** Replace dummy data with real Supabase queries

**Priority:** 🟠 HIGH - Misleading information for users

---

### 9. Admin Announcement Page Not Opening

**Problem:** Announcement page fails to load.

**Investigation Needed:**
- Check routing
- Check component errors
- Check API endpoint

**Priority:** 🟠 HIGH - Core admin feature broken

---

### 10. Creator Web Settings Page Not Opening

**Problem:** Settings page not accessible.

**Investigation Needed:**
- Check routing
- Check component errors
- Check authentication

**Priority:** 🟠 HIGH - Blocks profile management

---

## 📋 Complete Audit Report

See `docs/PRODUCTION_AUDIT.md` for:
- Full system audit (web + mobile)
- All identified issues
- Security concerns
- Feature completeness assessment
- Dead-ends and incomplete flows
- Testing recommendations

---

## 🎯 Immediate Action Plan

### Today (Day 1)
1. ✅ Fix event access error messages
2. ✅ Remove all emojis
3. 🔄 Investigate photo loading issue
4. 🔄 Investigate announcement page issue
5. 🔄 Investigate settings page issue

### Day 2-3
1. 🔄 Build admin feature assignment UI
2. 🔄 Wire features system to replace PLAN_LIMITS
3. 🔄 Fix photo thumbnail rendering
4. 🔄 Fix mobile upload button layout

### Day 4-5
1. 🔄 Wire mobile analytics to real data
2. 🔄 Security audit completion
3. 🔄 Testing of critical flows
4. 🔄 Documentation updates

---

**Next Steps:**
1. Start fixing Priority 1 issues (feature assignment UI, wiring features system)
2. Investigate and fix photo loading issues
3. Test all critical flows end-to-end
4. Re-audit after fixes
