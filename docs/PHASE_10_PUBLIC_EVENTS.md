# Phase 10: Public Event Pages, QR Codes & Shareable Links

## Overview

Phase 10 enables photographers to share their events publicly with attendees through multiple channels:
- Public event pages with unique URLs
- QR codes for physical display
- Embeddable widgets for websites
- Social media sharing
- Access code protection

## Features

### 1. Public Event Pages

**Route: `/e/[slug]`**

- Clean, branded event landing page
- Event details (name, date, location, photographer)
- Photo gallery preview with watermarks
- Direct CTA to face scanner
- Social share buttons
- Works without login

**Key Features:**
- Automatic slug generation from event name
- Short links for easy sharing (`/s/ABC123`)
- Optional access code protection
- Mobile-optimized design

### 2. Face Scanner on Public Pages

**Route: `/e/[slug]/scan`**

- Guided biometric face scanning
- No account required (configurable)
- Real-time face matching
- Photo selection and purchase flow
- Lightbox gallery view

### 3. QR Code Generation

**Features:**
- Auto-generated for each event
- Multiple size options (256px - 1024px)
- Dark/light theme variants
- Download as PNG
- High error correction for logo overlay

**Usage Tips:**
- Print at least 2x2 inches
- Display at event entrance
- Add to programs/table cards
- Test before printing

### 4. Embeddable Widgets

**Route: `/embed/[slug]`**

Three widget types:
1. **Gallery** - Photo grid with CTA
2. **Scanner** - Direct to face scan
3. **Button** - Simple link button

**Customization Options:**
- Theme: light/dark/auto
- Primary color
- Number of columns (1-6)
- Max photos to show
- Show/hide branding

**Embed Code Example:**
```html
<iframe 
  src="https://ferchr.com/embed/my-event?type=gallery&theme=auto" 
  width="100%" 
  height="500" 
  frameborder="0"
></iframe>
```

### 5. Access Code Protection

**Features:**
- Optional access code requirement
- Auto-generated 6-character codes
- Case-insensitive validation
- Code reveal/hide toggle
- Regenerate code option

**Use Cases:**
- Private events
- VIP sections
- Delayed public release

### 6. Sharing Settings

**Creator Controls:**
- Toggle public listing
- Enable/disable anonymous scanning
- Require access code
- Custom URL slug
- Create multiple share links

## Database Schema

### New Columns on `events` Table
```sql
public_slug VARCHAR(100) UNIQUE
is_publicly_listed BOOLEAN DEFAULT FALSE
allow_anonymous_scan BOOLEAN DEFAULT TRUE
require_access_code BOOLEAN DEFAULT FALSE
public_access_code VARCHAR(20)
share_settings JSONB DEFAULT '{}'
qr_code_url TEXT
short_link VARCHAR(50)
```

### New Tables

**event_share_links**
- Track different share methods
- Usage limits and expiration
- Access code per link

**event_link_analytics**
- Track visits and actions
- Device/browser breakdown
- Referrer tracking

**event_embeds**
- Store embed configurations
- Customization settings

## API Endpoints

### Public (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events/public/[slug]` | Get public event data |
| GET | `/s/[code]` | Short link redirect |
| GET | `/embed/[slug]` | Embeddable widget |

### Creator (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events/[id]/share` | Get sharing info |
| PUT | `/api/events/[id]/share` | Update share settings |
| POST | `/api/events/[id]/share` | Create share link |
| DELETE | `/api/events/[id]/share?linkId=X` | Revoke share link |

## Components

### EventSharePanel
Full-featured sharing modal for photographers:
- Quick social share buttons
- Copy links
- QR code download
- Embed code generator
- Access code management
- Analytics overview

### Public Event Page
- Hero with cover image
- Event info card
- Creator profile
- Photo preview grid
- Face scan CTA
- Social share menu

## URL Structure

| URL Pattern | Description |
|-------------|-------------|
| `/e/[slug]` | Main public event page |
| `/e/[slug]/scan` | Direct to scanner |
| `/s/[code]` | Short link redirect |
| `/embed/[slug]` | Embeddable widget |

## Analytics Tracked

- Page views
- Unique visitors (hashed)
- Referrer source
- Device type
- Browser
- Actions (view, scan, purchase)
- Share link performance

## Security Considerations

1. **Access Codes**
   - Stored securely
   - Case-insensitive matching
   - Rate limiting on attempts

2. **Public Data**
   - Only thumbnails exposed
   - No direct download links
   - Watermarks on previews

3. **Face Scanning**
   - Optional account requirement
   - Consent still required
   - Data not stored for anonymous users

## Usage Flow

### Creator Flow
1. Create/activate event
2. Open Share panel
3. Copy link or download QR
4. Configure access settings
5. Monitor analytics

### Attendee Flow
1. Scan QR or click link
2. Enter access code (if required)
3. View event page
4. Scan face to find photos
5. Select and purchase

## Future Enhancements

- [ ] Public event directory
- [ ] SEO meta tags
- [ ] Social preview images
- [ ] Custom branding per event
- [ ] Scheduled public release
- [ ] Analytics dashboard
- [ ] Multi-language support
