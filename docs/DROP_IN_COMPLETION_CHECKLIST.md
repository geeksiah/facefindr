# Drop-In Feature - Completion Checklist

## ✅ Implementation Complete

### Core Infrastructure
- [x] Database schema (migration 039)
- [x] All API routes implemented
- [x] Face recognition integration
- [x] Payment processing (Stripe)
- [x] Webhook handling
- [x] Contact management
- [x] Subscription management

### UI Components
- [x] Web upload page
- [x] Web discovery page
- [x] Web success page
- [x] Mobile upload screen
- [x] Mobile discovery screen
- [x] Navigation integration

### Face Indexing
- [x] Face registration indexes to global collection
- [x] Face refresh indexes to global collection
- [x] Backfill migration created (040)
- [x] Backfill API route created

## 🚀 Deployment Steps

### 1. Run Database Migrations
```bash
supabase migration up
```

This will:
- Create all drop-in tables (039)
- Create backfill tracking table (040)
- Set up all RLS policies
- Create helper functions

### 2. Backfill Existing Faces (Optional but Recommended)
If you have existing attendee faces, run the backfill:

```bash
# Check status
curl -X GET https://your-app.com/api/faces/backfill

# Process backfill (run multiple times until all are indexed)
curl -X POST https://your-app.com/api/faces/backfill
```

**Note**: The backfill API requires the original face scan images. If you don't have them stored, existing faces won't be backfilled, but all NEW face registrations will automatically be indexed.

### 3. Configure Stripe Webhook
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-app.com/api/drop-in/webhook`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded` (optional, as fallback)
4. Copy webhook signing secret to environment variable:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### 4. Test End-to-End Flow

#### Test Upload Flow:
1. Navigate to `/dashboard/drop-in/upload` (web) or `/(attendee)/drop-in/upload` (mobile)
2. Select a photo
3. Optionally add gift message
4. Complete Stripe checkout
5. Verify webhook triggers processing
6. Check that face matching runs

#### Test Discovery Flow:
1. As a premium user, navigate to `/dashboard/drop-in/discover`
2. Verify drop-in photos appear
3. Test viewing photo details
4. Test gift message unlock
5. Test save to passport

#### Test Free Tier:
1. As a free user registered for events
2. Verify they can see drop-in photos from contacts
3. Verify they can see gifted drop-in photos
4. Verify they cannot see non-contact, non-gifted photos

### 5. Monitor & Debug

#### Check Processing Status:
```sql
-- Check drop-in photos processing
SELECT 
  id,
  upload_payment_status,
  face_processing_status,
  faces_detected,
  matches_found,
  created_at
FROM drop_in_photos
ORDER BY created_at DESC
LIMIT 10;
```

#### Check Matches:
```sql
-- Check drop-in matches
SELECT 
  dm.id,
  dm.confidence,
  dm.verification_status,
  dip.original_filename,
  a.display_name as matched_attendee
FROM drop_in_matches dm
JOIN drop_in_photos dip ON dm.drop_in_photo_id = dip.id
JOIN attendees a ON dm.matched_attendee_id = a.id
ORDER BY dm.created_at DESC
LIMIT 10;
```

#### Check Notifications:
```sql
-- Check notifications
SELECT 
  id,
  status,
  is_gifted,
  requires_premium,
  created_at
FROM drop_in_notifications
WHERE recipient_id = 'user-id-here'
ORDER BY created_at DESC;
```

## 🔧 Configuration

### Environment Variables Required:
```env
# AWS Rekognition
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URLs
NEXT_PUBLIC_APP_URL=https://your-app.com
EXPO_PUBLIC_APP_URL=https://your-app.com
```

## 📝 Known Limitations & Future Enhancements

### Current Limitations:
1. **Backfill requires original images**: If original face scan images aren't stored, existing faces can't be backfilled. New registrations work fine.
2. **Synchronous processing**: Face matching happens synchronously in API. For production scale, consider background jobs.
3. **No push notifications yet**: Notifications are created but not sent. Integrate with Expo Notifications (mobile) and web push (web).

### Future Enhancements:
1. **Background job queue**: Move face matching to background jobs for better scalability
2. **Push notifications**: Integrate with notification services
3. **Email notifications**: Send email when drop-in photo is found
4. **Contact management UI**: Build UI for adding/removing contacts
5. **Subscription management UI**: Build checkout and management pages
6. **Analytics dashboard**: Track drop-in uploads, matches, conversions
7. **Refund automation**: Auto-refund if no match found within 7 days
8. **Abuse prevention**: Rate limiting, reporting, blocking features

## 🐛 Troubleshooting

### Issue: Drop-in photos not matching
**Solution**: 
- Verify attendee faces are indexed in global collection
- Check AWS Rekognition collection exists: `ferchr-attendees`
- Verify face registration API is working
- Check processing logs for errors

### Issue: Webhook not triggering
**Solution**:
- Verify webhook URL is correct in Stripe dashboard
- Check webhook secret is set correctly
- Verify webhook endpoint is accessible
- Check server logs for webhook errors

### Issue: Payment succeeds but processing doesn't start
**Solution**:
- Check webhook is receiving events
- Verify `/api/drop-in/process` is being called
- Check processing API logs
- Verify drop-in photo record exists and payment status is 'paid'

### Issue: Free users can't see drop-in photos
**Solution**:
- Verify they are registered for events (check `event_access_tokens`)
- Verify they have contacts (check `contacts` table)
- Check RLS policies are correct
- Verify `has_premium_access` function works

## ✅ Final Verification

Before marking as production-ready:

- [ ] All migrations run successfully
- [ ] Stripe webhook configured and tested
- [ ] Face registration indexes to global collection (tested)
- [ ] Upload flow works end-to-end
- [ ] Payment processing works
- [ ] Face matching finds correct attendees
- [ ] Notifications are created
- [ ] Discovery page shows photos correctly
- [ ] Free tier access works (contacts + events)
- [ ] Premium tier access works
- [ ] Gift messages unlock correctly
- [ ] Mobile app works (upload + discover)
- [ ] Error handling is robust
- [ ] Logging is in place

## 🎉 Ready for Production!

Once all items are checked, the Drop-In feature is ready for production use!
