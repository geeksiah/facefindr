# Phase 4: Face Scanning UI, Consent Flow & Match Results Gallery

## Overview

This phase enhances the face scanning experience with:
- **Guided biometric face scanning** with 5-angle capture (center, left, right, up, down)
- Real-time face detection using TensorFlow.js
- Auto-capture when face position matches target
- Proper biometric consent flow
- Match results gallery with similarity scores
- Quick scan widget for event pages

## Components Implemented

### 1. GuidedFaceScanner Component

**The star feature** - A guided biometric face scanning experience:

**How it works:**
1. User sees a face outline with position indicators (😐 👈 👉 👆 👇)
2. Real-time face detection tracks head position using TensorFlow.js
3. Progress ring fills when face matches target position
4. Auto-captures after holding position for 1.5 seconds
5. Moves through 5 positions: Center → Left → Right → Up → Down
6. All 5 captures are sent to AWS Rekognition for robust face matching

**Technical Details:**
- Uses `@tensorflow/tfjs` and `@tensorflow-models/face-landmarks-detection`
- MediaPipe FaceMesh model for 468-point face landmarks
- Calculates yaw (left/right) and pitch (up/down) from facial landmarks
- Each position has defined acceptable ranges for yaw/pitch values

**Usage:**
```tsx
<GuidedFaceScanner
  onComplete={async (captures) => {
    // captures is an array of 5 base64 images
    await processCaptures(captures);
  }}
  onCancel={() => setStage('intro')}
/>
```

### 2. FaceScanner Component (Simple)

Simple camera capture component for fallback:
- Camera initialization with error handling
- Face guide overlay with corner markers
- Countdown timer before capture
- Front/back camera toggle
- Photo upload alternative
- Processing state indicator

**Key Features:**
- Mirror preview for selfie mode
- Quality settings for optimal recognition
- Responsive design for mobile/desktop
- Accessible controls

**Usage:**
```tsx
<FaceScanner
  onCapture={handleCapture}
  onCancel={handleCancel}
  isProcessing={isLoading}
  processingText="Finding your photos..."
/>
```

### 2. ConsentModal Component

GDPR-compliant biometric consent dialog:
- Clear explanation of data usage
- Three key privacy points (Secure, Limited Use, Delete Anytime)
- Required checkbox before proceeding
- Links to privacy policy

**Key Features:**
- Animated modal entrance
- Event context display
- Accessible focus management
- Legal compliance

**Usage:**
```tsx
<ConsentModal
  isOpen={showConsent}
  onAccept={handleAccept}
  onDecline={handleDecline}
  eventName="Summer Festival 2024"
/>
```

### 3. MatchResults Component

Display matched photos with organization:
- Success summary with count
- Grouped by event with expandable sections
- Photo grid with similarity scores
- Selection for bulk purchase
- Links to full event galleries

**Key Features:**
- Responsive grid layout
- Selection management per event
- Empty state handling
- Purchase flow integration

**Usage:**
```tsx
<MatchResults
  matches={eventMatches}
  totalMatches={42}
  onViewEvent={handleViewEvent}
  onPurchase={handlePurchase}
/>
```

### 4. QuickScanWidget Component

Lightweight scan widget for event pages:
- Simple photo upload
- Inline consent flow
- Processing indicator
- Results callback

**Usage:**
```tsx
<QuickScanWidget
  eventId={event.id}
  eventName={event.name}
  onMatchesFound={handleMatches}
/>
```

## API Routes

### POST /api/faces/search

Search for matching photos across events:

**Request:**
```json
{
  "image": "base64-encoded-image",
  "eventId": "optional-specific-event-id"
}
```

**Response:**
```json
{
  "totalMatches": 15,
  "matches": [
    {
      "eventId": "...",
      "eventName": "Summer Festival",
      "mediaId": "...",
      "thumbnailUrl": "...",
      "similarity": 98.5
    }
  ],
  "groupedMatches": {
    "event-id": [...]
  }
}
```

## Scan Flow

### Full Scan Flow (Photo Passport)

1. **Intro Screen** - Privacy overview, tips for best results
2. **Consent Modal** - Biometric consent with checkbox
3. **Camera/Upload** - Capture or upload photo
4. **Processing** - Register face + search all events
5. **Results** - Display matches grouped by event

### Quick Scan Flow (Event Page)

1. **Upload Photo** - Simple file picker
2. **Consent Modal** - Event-specific consent
3. **Processing** - Search specific event only
4. **Results** - Callback with matched photos

## UI/UX Features

### Camera Interface

- **Face Guide Oval** - Helps user position face correctly
- **Corner Guides** - Visual frame for face area
- **Countdown Timer** - 3-second countdown before capture
- **Flip Camera** - Toggle front/back camera
- **Cancel Button** - Exit camera mode

### Processing States

- **Initializing** - Camera startup with spinner
- **Ready** - Live preview with controls
- **Countdown** - Large animated numbers
- **Processing** - Overlay with progress indicator

### Match Display

- **Similarity Scores** - Percentage match confidence
- **Event Grouping** - Collapsible event sections
- **Photo Selection** - Multi-select for purchase
- **Empty State** - Helpful messaging when no matches

## Privacy & Compliance

### Consent Requirements

1. **Explicit Consent** - Checkbox must be checked
2. **Clear Explanation** - What data is collected
3. **Limited Purpose** - Only for photo matching
4. **Deletion Rights** - Can delete anytime
5. **Policy Link** - Link to full privacy policy

### Data Handling

- Face data encrypted in transit
- Stored in AWS Rekognition
- Can be deleted from profile settings
- Never shared with third parties

## File Structure

```
apps/web/src/components/face-scan/
├── index.ts                  # Exports
├── face-scanner.tsx          # Camera capture component
├── consent-modal.tsx         # Biometric consent dialog
├── match-results.tsx         # Results display
└── quick-scan-widget.tsx     # Event page widget
```

## Integration Points

### With Photo Passport

The scan page (`/gallery/scan`) integrates with:
- `/api/faces/register` - Store face in attendee collection
- `/api/faces/search` - Find matches across events
- Photo Passport gallery - Display all matched photos

### With Event Pages

The quick scan widget integrates with:
- Event detail page - Embedded widget
- `/api/faces/search` - Event-specific search
- Event gallery - Highlight matched photos

## Next Steps (Phase 5)

Phase 5 will add payment processing:
- Stripe Connect for photographer payouts
- Flutterwave for African markets
- PayPal as alternative option
- Checkout flow with cart
- Purchase confirmation and receipts
