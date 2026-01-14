# Phase 9: Settings

Complete settings management for photographers and attendees.

## Photographer Settings

### Profile Tab
- **Profile Photo**: Upload/remove with Supabase Storage
- **Basic Information**:
  - Display name
  - Business name
  - Bio (textarea)
  - Location
  - Phone number
- **Social Links**:
  - Website URL
  - Instagram handle
  - Twitter handle
  - Facebook URL

### Payments Tab
- Wallet connections (Stripe, Flutterwave, PayPal)
- Payout preferences
- Balance and transaction history
- (Reuses WalletSettings component)

### Security Tab
- **Email Address**: Display with verification status
- **Change Password**:
  - Current password verification
  - New password with confirmation
  - Show/hide password toggles
- **Two-Factor Authentication**: Enable/disable 2FA
- **Active Sessions**: View and manage logged-in devices

### Notifications Tab
- **Channels**:
  - Email notifications toggle
  - Push notifications toggle
- **SMS Notifications** (Studio Plan Only):
  - Only available for Studio plan subscribers
  - Only for payout notifications (not all types)
  - Server-side enforcement of plan restriction
- **Notification Types**:
  - New photo sale
  - Payout completed
  - New event views
  - Weekly digest
  - Monthly report
  - New follower
  - Event reminders
  - Low balance alert
  - Subscription reminder
  - Marketing emails

### Privacy Tab
- Profile visibility settings
- Search visibility
- Analytics sharing opt-out
- Data export (GDPR)
- Account deletion

## API Endpoints

### Photographer Profile
```
GET  /api/photographer/profile
PUT  /api/photographer/profile
```

### Profile Photo
```
POST   /api/photographer/profile-photo
DELETE /api/photographer/profile-photo
```

### Notification Settings
```
GET /api/photographer/notification-settings
PUT /api/photographer/notification-settings
```

### Password Change
```
PUT /api/auth/password
```

## Database Tables

### notification_settings (from Phase 7)
- `user_id` - User reference
- `email_enabled` - Email channel toggle
- `sms_enabled` - SMS channel toggle
- `push_enabled` - Push channel toggle
- Per-type notification toggles

### photographers table fields used
- `display_name`
- `business_name`
- `bio`
- `profile_photo_url`
- `website`, `instagram`, `twitter`, `facebook`
- `phone`, `location`, `timezone`

## Attendee Settings

### Privacy Section
- Allow tagging toggle
- Public profile toggle
- Show in search toggle

### Account Section
- Export personal data (GDPR compliance)
- Delete face data
- Delete account

### Security
- Password change
- Logout functionality

## Storage Buckets Required

### avatars bucket
```sql
-- Create avatars bucket for profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- RLS policy for avatars
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

## Features

### Profile Photo Upload
1. Client selects file (JPG, PNG, WebP)
2. Validates size (max 2MB)
3. Uploads to Supabase Storage `/avatars/{userId}/profile-{timestamp}.{ext}`
4. Gets public URL
5. Updates photographer profile

### Password Change
1. User enters current password
2. System verifies by attempting sign-in
3. If valid, updates password via Supabase Auth
4. Clears form and shows success

### Notification Preferences
1. Settings loaded on mount
2. Toggle updates local state
3. Save button persists to database
4. Upsert pattern for new/existing records

## UI Components Used
- `Switch` - Toggle controls
- `Input` - Form fields
- `Button` - Actions
- `useToast` - Success/error feedback
- Custom icons from Lucide

## Security Considerations
- Password verification before change
- File type validation for uploads
- Size limits on uploads
- RLS policies on storage
- Session validation on all endpoints
