# Phase 11: Mobile App

## Overview

React Native mobile app built with Expo for both photographers and attendees.

## Technology Stack

- **Framework**: React Native + Expo SDK 50
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand
- **Backend**: Supabase (shared with web app)
- **UI**: Custom components with Lucide icons
- **Camera**: expo-camera for QR scanning and face capture
- **Notifications**: expo-notifications for push notifications

## Project Structure

```
apps/mobile/
├── app/                        # Expo Router pages
│   ├── _layout.tsx             # Root layout with auth
│   ├── index.tsx               # Welcome screen
│   ├── scan.tsx                # QR code scanner
│   ├── enter-code.tsx          # Manual code entry
│   ├── face-scan.tsx           # Face scanning flow
│   ├── (auth)/                 # Auth screens
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (attendee)/             # Attendee tabs
│   │   ├── _layout.tsx         # Tab navigator
│   │   ├── index.tsx           # My Photos (Photo Passport)
│   │   ├── scan.tsx            # Find Photos
│   │   ├── events.tsx          # My Events
│   │   ├── notifications.tsx   # Notifications
│   │   └── profile.tsx         # Profile & Settings
│   └── (photographer)/         # Creator tabs
│       ├── _layout.tsx         # Tab navigator
│       ├── index.tsx           # Dashboard
│       ├── events.tsx          # Events list
│       ├── upload.tsx          # Photo upload
│       ├── analytics.tsx       # Analytics
│       └── profile.tsx         # Profile & Settings
├── src/
│   ├── components/
│   │   └── ui/                 # Reusable UI components
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Card.tsx
│   │       └── index.ts
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   ├── theme.ts            # Colors, spacing, typography
│   │   └── index.ts
│   ├── stores/
│   │   ├── auth-store.ts       # Auth state with Zustand
│   │   └── index.ts
│   └── hooks/
│       ├── use-notifications.ts # Push notifications
│       └── index.ts
├── assets/                     # App icons and splash
├── app.json                    # Expo config
├── package.json
├── tsconfig.json
└── babel.config.js
```

## Features

### For Attendees (Photo Passport)

1. **My Photos** - Photo timeline with purchased/entitled photos
2. **Find Photos** - Face scanning to discover photos from events
3. **My Events** - Events the user has attended
4. **Notifications** - Photo drops, purchase confirmations, promotions
5. **Profile** - FaceTag display, QR code sharing, settings

### For Creators

1. **Dashboard** - Revenue, views, photos, active events overview
2. **Events** - List, filter, and manage events
3. **Upload** - Multi-photo upload with event selection
4. **Analytics** - Revenue, views, sales, conversion metrics
5. **Profile** - FaceTag, web dashboard link, settings

### Shared Features

1. **QR Code Scanning** - Scan event QR codes for quick access
2. **Manual Code Entry** - Enter event access codes
3. **Push Notifications** - Real-time alerts for photo drops, payouts, etc.
4. **Deep Linking** - `ferchr://` URL scheme support

## Authentication

- Uses Supabase Auth with expo-secure-store for token persistence
- Automatic session refresh
- User type-based routing (photographer → photographer tabs, attendee → attendee tabs)

## Push Notifications

### Setup

1. Configure EAS project ID in `app.json`
2. Build with EAS for production push tokens
3. Save tokens to `push_tokens` table in Supabase

### Notification Types

- `photo_drop` - New photos available at an event
- `purchase_complete` - Photo purchase successful
- `payout_success` - Payout sent to wallet
- `promo` - Promotional messages

## Face Scanning

1. **Guided 5-Angle Capture**:
   - Center (straight ahead)
   - Left turn
   - Right turn
   - Tilt up
   - Tilt down

2. **Process**:
   - Request camera permission
   - Display guide overlay with position indicators
   - Capture photo at each position
   - Send to API for face indexing
   - Match against event photos

## Deep Linking

### URL Scheme: `ferchr://`

- `ferchr://event/{id}` - Open event page
- `ferchr://s/{code}` - Short code redirect
- `ferchr://profile/{faceTag}` - View profile

### Web Links

- `https://ferchr.com/e/{slug}` - Event page
- `https://ferchr.com/s/{code}` - Short code
- `https://ferchr.com/p/{slug}` - Creator profile
- `https://ferchr.com/u/{slug}` - User profile

## Development

```bash
# Install dependencies
cd apps/mobile
pnpm install

# Start development server
pnpm dev

# Run on iOS simulator
pnpm ios

# Run on Android emulator
pnpm android

# Type check
pnpm type-check
```

## Building for Production

```bash
# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Environment Variables

Create `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=https://api.ferchr.com
EXPO_PUBLIC_APP_URL=https://ferchr.com
```

## TODO

- [ ] Implement offline support with local caching
- [ ] Add biometric authentication option
- [ ] Implement photo download to camera roll
- [ ] Add in-app purchases for subscriptions
- [ ] Implement share sheets for photos
- [ ] Add haptic feedback for interactions
- [ ] Implement image lazy loading/caching
- [ ] Add pull-to-refresh animations
- [ ] Create onboarding flow for new users
