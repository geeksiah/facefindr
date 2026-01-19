# Admin Events Access Fix

## Issue
Events are not listed on admin dashboard. Admin must see and manage all events.

## Root Cause
The admin app uses `supabaseAdmin` which uses the service role key. Service role should bypass ALL RLS policies automatically. However, if events are not showing, possible causes:

1. **Service role key not configured correctly** - Using anon key instead of service role key
2. **RLS policies interfering with joins** - Even though service role bypasses RLS, joins might fail
3. **Query structure** - Using `!inner` join filters out events without photographers

## Solution

### 1. Verify Service Role Key
Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in admin app `.env.local`:
```env
SUPABASE_SERVICE_ROLE_KEY=eyJ... (service role key, not anon key)
```

### 2. Query Structure
Changed from `photographers!inner` to `photographers` (optional join) to avoid filtering events.

### 3. Error Handling
Added comprehensive error handling with fallback query if joins fail.

### 4. RLS Policies
Service role bypasses RLS automatically. No additional policies needed, but migration `042_admin_events_access.sql` documents this.

## Testing

1. Check admin dashboard events page
2. Verify events are listed
3. Check browser console for any errors
4. Verify service role key is correct

## Files Changed

- `apps/admin/src/app/(dashboard)/events/page.tsx` - Added error handling and fallback query
- `apps/admin/src/lib/supabase.ts` - Verified service role configuration
- `supabase/migrations/042_admin_events_access.sql` - Documentation migration

## Next Steps

If events still don't show:
1. Check server logs for specific error messages
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
3. Test simple query: `supabaseAdmin.from('events').select('*').limit(1)`
4. Check if photographers/attendees pages work (they use same pattern)
