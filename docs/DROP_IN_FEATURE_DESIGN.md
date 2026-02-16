# Drop-In Feature: Cross-Contact Photo Discovery

## Product Vision

**"Find photos of yourself from anyone, anywhere - even if they're not in your contacts."**

Enable users to discover photos of themselves uploaded by people outside their contact network, with optional gifting to cover recipient access fees.

---

## Feature Overview

### Free Tier
- Find photos uploaded in Ferchr by **contacts only**
- Receive notifications from contacts
- Basic photo discovery within contact network

### Paid Tier (Subscription or Pay-Per-Use)
- Find photos uploaded in Ferchr by **non-contacts**
- Find photos from external social media platforms
- Find photos from external websites
- Receive "drop-in" notifications from non-contacts

### Drop-In Upload Feature
- Upload photos of people not in your contacts
- Pay to make upload discoverable by premium users
- Optionally pay extra to "gift" access to recipient + add message
- Recipient receives notification even if on free plan (when gifted)

---

## User Flows

### Scenario: Kojo → Abena (Crush Drop-In)

1. **Kojo sees Abena** (not in contacts, shy to approach)
2. **Kojo takes photo** and opens Ferchr
3. **Kojo uploads photo** → System detects Abena not in contacts
4. **Kojo pays drop-in fee** ($2.99) to make upload discoverable
5. **Kojo adds message** (optional, 200 char limit)
6. **Kojo pays gift fee** ($4.99) to cover Abena's access + unlock message
7. **System processes face recognition** → Finds Abena's FaceTag
8. **Abena receives notification** (even on free plan, because gifted)
9. **Abena views photo + message** → Can respond or ignore

---

## Database Schema

### 1. Drop-In Photos Table
```sql
CREATE TABLE drop_in_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    media_id UUID REFERENCES media(id) ON DELETE SET NULL, -- If uploaded to media bucket
    storage_path TEXT NOT NULL, -- Direct storage path
    original_filename VARCHAR(255),
    file_size BIGINT,
    width INTEGER,
    height INTEGER,
    thumbnail_path TEXT,
    
    -- Discovery settings
    is_discoverable BOOLEAN DEFAULT FALSE, -- Requires payment
    discovery_scope VARCHAR(20) DEFAULT 'app_only', -- 'app_only', 'social_media', 'web_wide'
    
    -- Payment status
    upload_payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'failed'
    upload_payment_transaction_id UUID REFERENCES transactions(id),
    
    -- Gift settings
    is_gifted BOOLEAN DEFAULT FALSE,
    gift_payment_status VARCHAR(20) DEFAULT 'pending',
    gift_payment_transaction_id UUID REFERENCES transactions(id),
    gift_message TEXT, -- Max 200 characters, encrypted until recipient views
    gift_message_unlocked_at TIMESTAMPTZ, -- When recipient views
    
    -- Metadata
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    location_name VARCHAR(255),
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_drop_in_photos_uploader ON drop_in_photos(uploader_id);
CREATE INDEX idx_drop_in_photos_discoverable ON drop_in_photos(is_discoverable) WHERE is_discoverable = TRUE;
CREATE INDEX idx_drop_in_photos_gifted ON drop_in_photos(is_gifted) WHERE is_gifted = TRUE;
```

### 2. Drop-In Notifications Table
```sql
CREATE TABLE drop_in_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_in_photo_id UUID NOT NULL REFERENCES drop_in_photos(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Notification status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'viewed', 'dismissed'
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    
    -- Access control
    requires_premium BOOLEAN DEFAULT TRUE, -- False if gifted
    is_gifted BOOLEAN DEFAULT FALSE,
    gift_message_available BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drop_in_notifications_recipient ON drop_in_notifications(recipient_id);
CREATE INDEX idx_drop_in_notifications_status ON drop_in_notifications(status);
CREATE INDEX idx_drop_in_notifications_photo ON drop_in_notifications(drop_in_photo_id);
```

### 3. Drop-In Matches Table
```sql
CREATE TABLE drop_in_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drop_in_photo_id UUID NOT NULL REFERENCES drop_in_photos(id) ON DELETE CASCADE,
    matched_attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Face recognition data
    rekognition_face_id VARCHAR(255) NOT NULL,
    confidence DECIMAL(5,2) NOT NULL,
    bounding_box JSONB,
    
    -- Match status
    is_verified BOOLEAN DEFAULT FALSE, -- User confirmed it's them
    verification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected'
    
    -- Notification
    notification_id UUID REFERENCES drop_in_notifications(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drop_in_matches_photo ON drop_in_matches(drop_in_photo_id);
CREATE INDEX idx_drop_in_matches_attendee ON drop_in_matches(matched_attendee_id);
CREATE INDEX idx_drop_in_matches_confidence ON drop_in_matches(confidence DESC);
```

### 4. Contacts Table (Enhancement)
```sql
-- Add to existing connections table or create new contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    
    -- Contact metadata
    contact_type VARCHAR(20) DEFAULT 'mutual', -- 'mutual', 'one_way', 'blocked'
    added_at TIMESTAMPTZ DEFAULT NOW(),
    last_interaction_at TIMESTAMPTZ,
    
    UNIQUE(user_id, contact_id),
    CHECK(user_id != contact_id)
);

CREATE INDEX idx_contacts_user ON contacts(user_id);
CREATE INDEX idx_contacts_contact ON contacts(contact_id);
```

---

## Pricing Strategy

### Recommended: Hybrid Model (Subscription + Pay-Per-Use)

**Why Hybrid Works Best:**
1. **Low barrier to entry**: Free users can still receive gifted drop-ins
2. **Flexible monetization**: Power users pay subscription, casual users pay per-use
3. **Gift economy**: Encourages viral growth (people gift to others)
4. **Fair value exchange**: Users pay for what they use

### Pricing Tiers

#### Free Tier
- ✅ Find photos from contacts only
- ✅ Receive gifted drop-in notifications
- ❌ Cannot discover non-contact photos
- ❌ Cannot upload drop-in photos

#### Premium Subscription ($4.99/month)
- ✅ All free features
- ✅ Discover photos from non-contacts in app
- ✅ Upload drop-in photos (1 per month included)
- ✅ Receive all drop-in notifications
- ✅ View gift messages

#### Pay-Per-Use (No Subscription)
- ✅ All free features
- ✅ Upload drop-in photo: **$2.99 per upload**
- ✅ Gift access + message: **+$4.99** (covers recipient's access + unlocks message)
- ✅ Discover single non-contact photo: **$0.99**

#### Premium Plus ($9.99/month)
- ✅ All Premium features
- ✅ Unlimited drop-in uploads
- ✅ External social media search (Instagram, Facebook, Twitter)
- ✅ Web-wide photo discovery
- ✅ Priority face recognition processing

---

## Implementation Phases

### Phase 1: Core Drop-In (MVP) - 4 weeks
**Goal**: Basic drop-in upload and discovery within Ferchr app

1. **Database Schema**
   - Create `drop_in_photos`, `drop_in_notifications`, `drop_in_matches` tables
   - Create `contacts` table
   - Add RLS policies

2. **Contact Management**
   - Add/remove contacts
   - Check if user is contact before upload
   - Contact discovery (QR code, FaceTag search)

3. **Drop-In Upload Flow**
   - Photo upload UI
   - Contact check
   - Payment flow (upload fee)
   - Gift option (gift fee + message)
   - Face recognition processing

4. **Notification System**
   - Create notifications for matches
   - Send push/email notifications
   - Notification center UI

5. **Discovery & Viewing**
   - Drop-in photo gallery
   - Gift message viewing
   - Response options (thank, block, report)

### Phase 2: Premium Features - 6 weeks
**Goal**: Subscription system and premium discovery

1. **Subscription Management**
   - Premium subscription plans
   - Payment processing
   - Access control based on subscription

2. **Premium Discovery**
   - Non-contact photo discovery
   - Filter by discovery scope
   - Premium badge/indicators

3. **Analytics Dashboard**
   - Drop-in uploads sent/received
   - Gift messages sent/received
   - Discovery stats

### Phase 3: External Integration - 8 weeks
**Goal**: Social media and web discovery

1. **Social Media APIs**
   - Instagram Graph API integration
   - Facebook API integration
   - Twitter API integration
   - Rate limiting and quota management

2. **Web Crawling**
   - Image search APIs (Google Images, Bing)
   - Web scraping (with respect to robots.txt)
   - Image processing pipeline

3. **Privacy & Compliance**
   - GDPR compliance for external data
   - User consent for external search
   - Data retention policies

---

## Security & Privacy Considerations

### 1. Photo Privacy
- **Encryption**: All drop-in photos encrypted at rest
- **Access Control**: Only matched recipients can view
- **Deletion**: Uploader can delete anytime, recipient notified
- **Expiration**: Auto-delete after 90 days if not viewed

### 2. Message Privacy
- **Encryption**: Gift messages encrypted until recipient views
- **One-time View**: Message can only be viewed once
- **No Forwarding**: Messages cannot be shared or forwarded

### 3. Face Recognition Security
- **Consent**: Recipients must have consented to face recognition
- **Opt-out**: Users can disable drop-in notifications
- **Verification**: Low-confidence matches require user verification

### 4. Payment Security
- **Idempotency**: All payment transactions use idempotency keys
- **Refunds**: Auto-refund if recipient not found within 7 days
- **Fraud Prevention**: Rate limiting on uploads, suspicious activity detection

### 5. Abuse Prevention
- **Reporting**: Users can report inappropriate drop-ins
- **Blocking**: Users can block specific uploaders
- **Moderation**: AI + human moderation for reported content
- **Rate Limits**: Max 10 drop-ins per day per user

---

## User Experience Flow

### Upload Flow (Kojo's Perspective)

1. **Take/Select Photo** → Camera or gallery
2. **Upload Screen** → Shows "Drop-In Photo" option
3. **Contact Check** → "This person is not in your contacts"
4. **Payment Screen** → 
   - Upload fee: $2.99 (required)
   - Gift access: +$4.99 (optional)
   - Message: 200 chars (if gifting)
5. **Processing** → Face recognition in progress
6. **Success** → "Photo uploaded! We'll notify them if found."

### Discovery Flow (Abena's Perspective)

1. **Notification** → "Kojo sent you a drop-in photo!"
2. **View Notification** → Tap to open
3. **Photo View** → See photo + message (if gifted)
4. **Actions** → 
   - "Thank" (send thank you message)
   - "Save to Passport"
   - "Block User"
   - "Report"
5. **Response** → Optional thank you message back

---

## Technical Architecture

### 1. Upload API
```
POST /api/drop-in/upload
- Validate photo
- Check contacts
- Process payment
- Upload to storage
- Queue face recognition
- Create drop-in record
```

### 2. Face Recognition Processing
```
Background Job:
1. Extract faces from photo
2. Match against FaceTag database
3. Create drop_in_matches records
4. Create notifications for matches
5. Send push/email notifications
```

### 3. Discovery API
```
GET /api/drop-in/discover
- Filter by subscription tier
- Filter by discovery scope
- Pagination
- Sort by date/confidence
```

### 4. Notification API
```
GET /api/drop-in/notifications
- List pending/viewed notifications
- Mark as viewed
- Unlock gift messages
```

---

## Success Metrics

### Engagement
- Drop-in uploads per day
- Gift messages sent per day
- Notification open rate
- Photo view rate

### Revenue
- Subscription conversion rate
- Pay-per-use transaction volume
- Average revenue per user (ARPU)
- Gift transaction volume

### Network Effects
- Contacts added per user
- Cross-contact discoveries
- Viral coefficient (gifts received → new users)

### User Satisfaction
- Response rate to drop-ins
- Block/report rate (lower is better)
- User retention after first drop-in

---

## Edge Cases & Solutions

### 1. Recipient Not Found
- **Solution**: Auto-refund upload fee after 7 days
- **Notification**: "We couldn't find this person. Your payment has been refunded."

### 2. Multiple Matches (Low Confidence)
- **Solution**: Show "Is this you?" verification screen
- **Fallback**: Require user confirmation for matches < 85% confidence

### 3. Recipient on Free Plan (Not Gifted)
- **Solution**: Show "Upgrade to Premium" prompt
- **Alternative**: Allow one-time $0.99 unlock

### 4. Abusive Content
- **Solution**: Report → Review → Block uploader
- **Prevention**: AI content moderation before notification

### 5. Duplicate Uploads
- **Solution**: Detect similar photos, show "Already uploaded" warning
- **Deduplication**: Hash-based duplicate detection

---

## Next Steps

1. **Review & Approve Design** → Product team sign-off
2. **Database Migration** → Create schema
3. **API Development** → Build upload/discovery APIs
4. **UI/UX Design** → Design upload and discovery screens
5. **Payment Integration** → Stripe for subscriptions + one-time payments
6. **Testing** → Unit, integration, security testing
7. **Beta Launch** → Limited user testing
8. **Full Launch** → Public release

---

## Questions for Product Team

1. **Message Length**: 200 chars enough? Should we allow images/links?
2. **Gift Pricing**: $4.99 fair? Should it vary by region?
3. **Expiration**: 90 days too long/short?
4. **External Search**: Start with which platforms? (Instagram first?)
5. **Moderation**: AI-only or human review for reported content?
