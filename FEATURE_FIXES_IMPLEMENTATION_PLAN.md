# Feature Fixes Implementation Plan
**Date:** January 14, 2026  
**Status:** Critical Fixes In Progress

## 🔴 CRITICAL FIXES - IN PROGRESS

### ✅ 1. Pricing & Currency System (COMPLETED)
- ✅ Migration created for bulk pricing
- ✅ Fee calculator implemented
- ✅ Checkout route fixed
- ✅ Currency conversion integrated
- ✅ Subscription limits enforced

### 🔄 2. User Feedback System (IN PROGRESS)

#### 2.1 Toast Notifications
**Status:** Partially Implemented
**Files Modified:**
- ✅ `event-gallery.tsx` - Added toasts for delete success/error
- ✅ `delete-event-button.tsx` - Created with toasts
- 🔴 Login page - No toast (only inline error)
- 🔴 Register page - No toast (only inline error)
- 🔴 Event creation - No toast (only inline error)
- 🔴 Photo upload - No toast
- 🔴 Event settings save - No toast
- 🔴 Password change - No toast

**Action Items:**
1. Add `useToast()` to login page
2. Add success toast on login
3. Add `useToast()` to register page
4. Add success toast on register
5. Add `useToast()` to event creation page
6. Add success toast on event creation
7. Add toast to photo uploader on success/error
8. Add toast to event settings save
9. Add toast to password change

#### 2.2 Confirmation Dialogs
**Status:** Partially Implemented
**Files Modified:**
- ✅ `event-gallery.tsx` - Added confirmation for photo delete
- ✅ `delete-event-button.tsx` - Added confirmation
- 🔴 Account deletion - No confirmation
- 🔴 Face profile deletion - No confirmation
- 🔴 Bulk actions - Needs confirmation
- 🔴 Event archiving - No confirmation

**Action Items:**
1. Add confirmation to account deletion
2. Add confirmation to face profile deletion
3. Add confirmation to bulk delete
4. Add confirmation to event archiving

#### 2.3 Loading States
**Status:** Partially Implemented
**Files Modified:**
- ✅ Button component has `isLoading` prop
- 🔴 Event creation - Has loading but no spinner on button
- 🔴 Photo upload - No loading indicator
- 🔴 Face processing - No loading indicator
- 🔴 Checkout creation - No loading indicator

**Action Items:**
1. Add `isLoading` to all form buttons
2. Add loading indicator to photo upload
3. Add loading indicator to face processing
4. Add loading indicator to checkout

#### 2.4 Haptic Feedback (Mobile)
**Status:** NOT STARTED
**Files Created:**
- ✅ `apps/mobile/src/lib/haptics.ts` - Created utility
- 🔴 Package not installed (user needs to run: `cd apps/mobile && pnpm add expo-haptics`)

**Action Items:**
1. Install expo-haptics package
2. Add haptic feedback to:
   - Button presses (`buttonPress()`)
   - Successful actions (`success()`)
   - Errors (`error()`)
   - Face detection (`faceDetected()`)
   - Match found (`matchFound()`)
   - No match (`noMatch()`)
   - Photo download (`downloadComplete()`)
   - Notifications (`notification()`)
3. Update mobile screens:
   - `(attendee)/scan.tsx` - Add haptics
   - `face-scan.tsx` - Add haptics
   - `qr-scanner.tsx` - Add haptics
   - `checkout.tsx` - Add haptics
   - `photo/[id].tsx` - Add haptics
   - `(photographer)/upload.tsx` - Add haptics
   - All settings pages - Add haptics
   - All action buttons - Add haptics

### 🔴 3. Missing Critical Features

#### 3.1 Email Verification
**Status:** NOT IMPLEMENTED
**Issues:**
- 🔴 No email verification flow
- 🔴 No verification emails sent
- 🔴 No resend option
- 🔴 Users can use account without verification

**Action Items:**
1. Create email verification template
2. Send verification email on registration
3. Create verification page (`/verify-email?token=...`)
4. Add resend verification option
5. Block account features until verified (optional)

#### 3.2 Social Login
**Status:** NOT IMPLEMENTED
**Issues:**
- 🔴 Buttons exist but disabled
- 🔴 No OAuth implementation
- 🔴 No Google/Apple auth

**Action Items:**
1. Set up OAuth providers in Supabase
2. Implement Google OAuth
3. Implement Apple OAuth
4. Add OAuth callbacks
5. Handle OAuth user creation

#### 3.3 Biometric Auth
**Status:** NOT IMPLEMENTED
**Issues:**
- 🔴 Permissions configured but unused
- 🔴 No Face ID/Touch ID login
- 🔴 No biometric prompt

**Action Items:**
1. Install expo-local-authentication
2. Create biometric auth hook
3. Add biometric login option
4. Store biometric credentials securely
5. Add biometric prompt on login

#### 3.4 Photo Reactions
**Status:** NOT IMPLEMENTED
**Issues:**
- 🔴 Feature completely missing
- 🔴 No reaction buttons
- 🔴 No reaction display
- 🔴 No reaction notifications

**Action Items:**
1. Create `photo_reactions` table
2. Add reaction buttons to photo view
3. Add reaction display
4. Add reaction notifications
5. Add reaction analytics

#### 3.5 Tipping
**Status:** NOT IMPLEMENTED
**Issues:**
- 🔴 Feature completely missing
- 🔴 No tip prompt
- 🔴 No tip amounts
- 🔴 No tip history

**Action Items:**
1. Create `tips` table
2. Add tip prompt after download
3. Add preset amounts ($2, $5, $10)
4. Add custom amount input
5. Add tip history

### 🔴 4. Error Handling Improvements

#### 4.1 Network Errors
**Status:** NEEDS WORK
**Issues:**
- 🔴 No offline detection
- 🔴 No retry mechanism
- 🔴 No network error messages
- 🔴 No timeout handling

**Action Items:**
1. Add offline detection (Network Status API)
2. Add retry mechanism for failed requests
3. Add network error messages
4. Add timeout handling
5. Add request cancellation

#### 4.2 Rate Limiting
**Status:** NEEDS WORK
**Issues:**
- 🔴 No rate limit feedback to users
- 🔴 No rate limit UI indicators
- 🔴 No rate limit documentation

**Action Items:**
1. Add rate limit error handling
2. Add rate limit UI indicators
3. Add rate limit countdown
4. Document rate limits

### 🔴 5. Performance Optimizations

#### 5.1 Image Optimization
**Status:** NEEDS WORK
**Issues:**
- 🔴 No image lazy loading
- 🔴 No image optimization/resizing
- 🔴 No WebP/AVIF support
- 🔴 No responsive images

**Action Items:**
1. Add lazy loading to photo galleries
2. Add image optimization service
3. Add WebP/AVIF support
4. Add responsive images
5. Configure CDN

#### 5.2 Code Splitting
**Status:** NEEDS WORK
**Issues:**
- 🟡 No route-based code splitting
- 🟡 No component lazy loading
- 🟡 No bundle analysis

**Action Items:**
1. Add route-based splitting
2. Add lazy loading for heavy components
3. Analyze bundle size
4. Optimize bundle

### 🔴 6. Accessibility

#### 6.1 Web Accessibility
**Status:** NEEDS WORK
**Issues:**
- 🔴 No ARIA labels on many buttons
- 🔴 No keyboard navigation support
- 🔴 No focus indicators
- 🔴 No skip links

**Action Items:**
1. Add ARIA labels to all interactive elements
2. Add keyboard navigation
3. Add focus indicators
4. Add skip links
5. Test with screen readers

#### 6.2 Mobile Accessibility
**Status:** NEEDS WORK
**Issues:**
- 🔴 No accessibility labels
- 🔴 No accessibility hints
- 🔴 No dynamic type support

**Action Items:**
1. Add accessibility labels
2. Add accessibility hints
3. Support dynamic type
4. Add high contrast mode

---

## 📋 DETAILED ACTION CHECKLIST

### Immediate (Before Launch)
- [ ] Install expo-haptics package
- [ ] Add haptic feedback to all mobile interactions
- [ ] Add toast notifications to login/register
- [ ] Add toast notifications to event creation
- [ ] Add toast notifications to photo upload
- [ ] Add toast notifications to all save actions
- [ ] Add confirmation dialogs to all destructive actions
- [ ] Add loading states to all async operations
- [ ] Fix delete event button (DONE)
- [ ] Add confirmation to photo delete (DONE)
- [ ] Add confirmation to bulk delete (DONE)

### High Priority (Week 1)
- [ ] Implement email verification
- [ ] Add social login
- [ ] Add biometric auth
- [ ] Add offline support
- [ ] Add error reporting (Sentry)
- [ ] Add image optimization
- [ ] Add empty states everywhere
- [ ] Add accessibility labels

### Medium Priority (Month 1)
- [ ] Implement photo reactions
- [ ] Implement tipping
- [ ] Add bulk actions
- [ ] Add download progress
- [ ] Add event duplication
- [ ] Add performance optimizations
- [ ] Add onboarding tour

---

## 🎯 FILES TO MODIFY

### Mobile App
1. `apps/mobile/app/(attendee)/scan.tsx` - Add haptics
2. `apps/mobile/app/face-scan.tsx` - Add haptics
3. `apps/mobile/app/qr-scanner.tsx` - Add haptics
4. `apps/mobile/app/checkout.tsx` - Add haptics, toasts
5. `apps/mobile/app/photo/[id].tsx` - Add haptics
6. `apps/mobile/app/(photographer)/upload.tsx` - Add haptics, toasts
7. All mobile screens - Add haptics to buttons

### Web App
1. `apps/web/src/app/(auth)/login/page.tsx` - Add toasts
2. `apps/web/src/app/(auth)/register/page.tsx` - Add toasts
3. `apps/web/src/app/(dashboard)/dashboard/events/new/page.tsx` - Add toasts
4. `apps/web/src/components/events/photo-uploader.tsx` - Add toasts
5. `apps/web/src/app/(dashboard)/dashboard/events/[id]/settings/page.tsx` - Add toasts
6. All action buttons - Add loading states
7. All delete buttons - Add confirmations

---

**Next:** Continue implementing haptic feedback and toast notifications systematically.
