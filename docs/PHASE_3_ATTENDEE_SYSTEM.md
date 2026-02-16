# Phase 3: Attendee Accounts, FaceTag System & Photo Passport

## Overview

This phase implements the complete attendee experience for Ferchr, including:
- Attendee account creation with unique FaceTag
- Face scanning and registration
- Photo Passport gallery
- Event access and photo matching

## Features Implemented

### 1. FaceTag System

Each attendee gets a unique FaceTag in the format `@username#1234`:
- Generated automatically during registration
- 4-digit random suffix ensures uniqueness
- Can be shared with photographers for manual tagging
- Displayed prominently in the attendee profile

**Implementation:**
- `apps/web/src/app/(auth)/actions.ts` - FaceTag generation during registration
- FaceTag is stored in `attendees.face_tag` and `attendees.face_tag_suffix`

### 2. Attendee Gallery Layout

New route group `(gallery)` with attendee-focused navigation:
- `/gallery` - Photo Passport (matched photos)
- `/gallery/scan` - Face scanning interface
- `/gallery/events` - Events list
- `/gallery/profile` - Profile management
- `/gallery/notifications` - Notification center
- `/gallery/settings` - Privacy & account settings

**Key Files:**
- `apps/web/src/app/(gallery)/layout.tsx` - Gallery layout with mobile-first navigation
- `apps/web/src/app/(gallery)/gallery/page.tsx` - Photo Passport main page

### 3. Face Scanning

Full-featured face scanning interface:
- Camera capture with face guide overlay
- Photo upload alternative
- Biometric consent flow
- Processing with AWS Rekognition
- Automatic photo matching across events

**Key Files:**
- `apps/web/src/app/(gallery)/gallery/scan/page.tsx` - Scan interface
- `apps/web/src/app/api/faces/register/route.ts` - Face registration API

### 4. Photo Passport

The Photo Passport shows all photos where the attendee was detected:
- Grouped by event
- Selection for bulk download/purchase
- Watermarked previews for unpurchased photos
- Quick actions (like, share)

### 5. Attendee Profile

Complete profile management:
- Display name editing
- FaceTag display with copy-to-clipboard
- Face profile status and refresh
- Stats (photos, events, face profiles)

**Key Files:**
- `apps/web/src/app/(gallery)/gallery/profile/page.tsx`
- `apps/web/src/app/api/attendee/profile/route.ts`

### 6. Event Access

Attendees can join events via:
- Access codes from photographers
- Automatic matching via face scan

**Key Files:**
- `apps/web/src/app/(gallery)/gallery/events/page.tsx`
- `apps/web/src/app/(gallery)/gallery/events/[id]/page.tsx`
- `apps/web/src/app/api/events/join/route.ts`
- `apps/web/src/app/api/events/[id]/attendee-view/route.ts`

### 7. Privacy Controls

GDPR-compliant privacy features:
- Delete face data anytime
- Export all personal data
- Control tagging permissions
- Delete account with full data removal

**Key Files:**
- `apps/web/src/app/(gallery)/gallery/settings/page.tsx`
- `apps/web/src/app/api/attendee/face-profile/route.ts`
- `apps/web/src/app/api/attendee/export/route.ts`
- `apps/web/src/app/api/attendee/account/route.ts`

### 8. Notification System

Basic notification infrastructure:
- Photo match notifications
- New event notifications
- Event update notifications
- Email and push notification toggles

**Key Files:**
- `apps/web/src/app/(gallery)/gallery/notifications/page.tsx`
- `apps/web/src/app/api/attendee/notifications/route.ts`
- `apps/web/src/app/api/attendee/notification-settings/route.ts`

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/faces/register` | POST | Register attendee's face |
| `/api/attendee/profile` | GET, PATCH | Get/update attendee profile |
| `/api/attendee/face-profile` | GET, DELETE | Manage face profile |
| `/api/attendee/events` | GET | Get attendee's events |
| `/api/attendee/notifications` | GET | Get notifications |
| `/api/attendee/notification-settings` | GET, PATCH | Manage notification prefs |
| `/api/attendee/privacy-settings` | GET, PATCH | Manage privacy settings |
| `/api/attendee/export` | GET | Export personal data |
| `/api/attendee/account` | DELETE | Delete account |
| `/api/events/join` | POST | Join event via access code |
| `/api/events/[id]/attendee-view` | GET | Get event for attendee view |

## AWS Rekognition Integration

### Attendee Collection

A global collection `ferchr-attendees` stores all attendee face profiles:
- One face profile per attendee (primary)
- Used for initial matching across events
- ExternalImageId = user ID for reference

### Face Registration Flow

1. Attendee takes selfie or uploads photo
2. Face is indexed to `ferchr-attendees` collection
3. System searches all event collections for matches
4. Matched photos are displayed in Photo Passport

### Privacy & Data Deletion

When an attendee deletes their face data:
1. Face IDs are removed from Rekognition
2. Database records are deleted
3. `last_face_refresh` is set to null

## Database Tables Used

- `attendees` - Attendee profiles with FaceTag
- `attendee_face_profiles` - Rekognition face references
- `attendee_consents` - Biometric consent records
- `entitlements` - Purchased photos
- `download_logs` - Download history
- `event_access_tokens` - Event access codes

## UI/UX Features

### Mobile-First Design
- Bottom navigation for mobile
- Top navigation for desktop
- Responsive grid layouts

### iOS-Inspired Elements
- Rounded corners (16px cards)
- Subtle borders and shadows
- Accent blue for actions
- Clean typography with Inter font

### Interactive Elements
- Photo selection with checkboxes
- Lightbox for photo preview
- Swipe gestures (planned)
- Pull-to-refresh (planned)

## Next Steps (Phase 4)

Phase 4 will build on this foundation with:
- Face scanning UI improvements
- Consent flow enhancements
- Match results gallery with similarity scores
- Face match animations
