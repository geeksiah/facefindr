# Phase 10b: Social Features - FaceTags & Follows

## Overview

This extension adds social features to FaceFindr:
- Photographers get FaceTags like attendees (`@photographer.1234`)
- Attendees can follow photographers
- Photographers can add/connect with attendees
- Profile QR codes for sharing
- Deep linking to mobile app

## Features

### 1. Photographer FaceTags

Every photographer automatically gets a unique FaceTag:
- Format: `@displayname.1234`
- Searchable by attendees
- Unique across both photographers and attendees
- Auto-generated on account creation

### 2. Follow System

**Attendees can follow photographers to:**
- Get notified of new events
- Get notified when photos are ready
- Easily find photographer's public events

**Follow Features:**
- One-click follow/unfollow
- Customizable notification preferences per follow
- Follower count on photographer profiles

### 3. Connections (Photographer <-> Attendee)

**Photographers can add attendees as connections to:**
- Tag them in photos easily
- Build a client list
- Organize with tags and notes

**Connection Types:**
- `event` - Connected via event attendance
- `scan` - Connected via face scan
- `manual` - Manually added by photographer
- `qr_code` - Connected via QR code scan

### 4. Public Profile Pages

**Photographer Profile (`/p/{slug}`):**
- Profile photo, bio, social links
- Follower count
- Recent public events
- Follow button
- QR code for sharing

**Attendee Profile (`/u/{slug}`):**
- Profile photo, FaceTag
- Following count
- Connection CTA for photographers

### 5. Profile QR Codes

**Features:**
- One-click QR code generation
- Download as PNG
- Deep link enabled (`?app=1`)
- Scannable by anyone

**URL Structure:**
- Web: `https://facefindr.com/p/{slug}`
- App Deep Link: `facefindr://photographer/{id}`
- Universal Link: `https://facefindr.com/p/{slug}?app=1`

### 6. Deep Linking (Mobile App)

When QR code is scanned:
1. Web page loads with `?app=1` parameter
2. Page attempts to open app via deep link
3. If app installed → opens profile in app
4. If not installed → user stays on web page

**App URL Schemes:**
- `facefindr://profile/photographer/{id}`
- `facefindr://profile/attendee/{id}`
- `facefindr://photographer/{id}`
- `facefindr://user/{id}`

## Database Schema

### New Columns

**photographers table:**
```sql
face_tag VARCHAR(50) UNIQUE
public_profile_slug VARCHAR(100) UNIQUE
is_public_profile BOOLEAN DEFAULT TRUE
allow_follows BOOLEAN DEFAULT TRUE
follower_count INTEGER DEFAULT 0
profile_qr_code_url TEXT
```

**attendees table:**
```sql
following_count INTEGER DEFAULT 0
public_profile_slug VARCHAR(100) UNIQUE
is_public_profile BOOLEAN DEFAULT FALSE
profile_qr_code_url TEXT
```

### New Tables

**follows:**
- `follower_id` - Who is following
- `follower_type` - 'attendee' or 'photographer'
- `following_id` - Who is being followed
- `following_type` - 'photographer'
- `status` - 'active', 'blocked', 'muted'
- `notify_new_event` - Boolean
- `notify_photo_drop` - Boolean

**connections:**
- `photographer_id` - Photographer
- `attendee_id` - Attendee
- `connection_type` - 'event', 'scan', 'manual', 'qr_code'
- `source_event_id` - Optional source event
- `notes` - Photographer notes
- `tags` - Array of tags

**profile_views:**
- `profile_id` - Profile being viewed
- `profile_type` - 'photographer' or 'attendee'
- `viewer_id` - Optional viewer
- `source` - 'qr_code', 'search', 'event', 'direct'
- `device_type` - Device info

## API Endpoints

### Social

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/social/follow` | Follow a photographer |
| DELETE | `/api/social/follow?photographerId=X` | Unfollow |
| GET | `/api/social/follow?type=check&photographerId=X` | Check follow status |
| GET | `/api/social/follow?type=following` | Get following list |
| GET | `/api/social/follow?type=followers&photographerId=X` | Get followers |
| GET | `/api/social/search?q=X` | Search photographers/users |

### Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profiles/photographer/{slug}` | Get photographer profile |
| GET | `/api/profiles/user/{slug}` | Get attendee profile |
| POST | `/api/profiles/view` | Track profile view |

## Pages

| URL | Description |
|-----|-------------|
| `/p/{slug}` | Photographer public profile |
| `/u/{slug}` | Attendee public profile |

## Services

### follow-service.ts
- `followPhotographer()`
- `unfollowPhotographer()`
- `isFollowing()`
- `getFollowers()`
- `getFollowing()`
- `searchPhotographers()`

### profile-service.ts
- `getPhotographerProfile()`
- `getAttendeeProfile()`
- `generateProfileUrls()`
- `generateProfileQRCode()`
- `trackProfileView()`

### connection-service.ts
- `addConnection()`
- `getConnections()`
- `updateConnection()`
- `removeConnection()`
- `findAttendeeByFaceTag()`
- `addConnectionsFromEvent()`

## Mobile App Integration

### Deep Link Handling (React Native)

```javascript
import { Linking } from 'react-native';

// Handle incoming deep links
Linking.addEventListener('url', ({ url }) => {
  const parsed = parseDeepLink(url);
  if (parsed.type === 'photographer') {
    navigation.navigate('PhotographerProfile', { id: parsed.id });
  } else if (parsed.type === 'user') {
    navigation.navigate('UserProfile', { id: parsed.id });
  }
});

// Parse deep link
function parseDeepLink(url: string) {
  // facefindr://photographer/uuid
  // facefindr://user/uuid
  // facefindr://profile/photographer/uuid
  const match = url.match(/facefindr:\/\/(photographer|user|profile)\/(.*)/);
  if (match) {
    return { type: match[1], id: match[2] };
  }
  return null;
}
```

### Universal Links (iOS)

Add to `apple-app-site-association`:
```json
{
  "applinks": {
    "apps": [],
    "details": [{
      "appID": "TEAMID.com.facefindr.app",
      "paths": ["/p/*", "/u/*"]
    }]
  }
}
```

### App Links (Android)

Add to `AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="facefindr.com" android:pathPrefix="/p/" />
  <data android:scheme="https" android:host="facefindr.com" android:pathPrefix="/u/" />
</intent-filter>
```

## Usage Examples

### Follow a Photographer

```typescript
// In attendee's app/gallery
const handleFollow = async (photographerId: string) => {
  const res = await fetch('/api/social/follow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photographerId }),
  });
  
  if (res.ok) {
    // Show success
  }
};
```

### Add Connection by FaceTag

```typescript
// In photographer's dashboard
const addByFaceTag = async (faceTag: string) => {
  // First find the attendee
  const searchRes = await fetch(`/api/social/search?q=${faceTag}&type=users`);
  const { users } = await searchRes.json();
  
  if (users.length > 0) {
    // Add as connection
    await addConnection(users[0].id);
  }
};
```

### Share Profile

```typescript
const shareProfile = async () => {
  const url = `https://facefindr.com/p/${profile.public_profile_slug}`;
  
  // Native share on mobile
  if (navigator.share) {
    await navigator.share({
      title: profile.display_name,
      text: `Check out ${profile.display_name} on FaceFindr`,
      url,
    });
  } else {
    // Copy to clipboard
    await navigator.clipboard.writeText(url);
  }
};
```

## Future Enhancements

- [ ] Mutual follows (photographers following each other)
- [ ] Featured photographers directory
- [ ] Profile verification badges
- [ ] Profile customization (cover photos, themes)
- [ ] Connection import from contacts
- [ ] Message/chat between connected users
- [ ] Profile analytics for photographers
