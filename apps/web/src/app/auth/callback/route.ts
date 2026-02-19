import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isCreatorUser, normalizeUserType } from '@/lib/user-type';

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function detectCountryFromRequest(request: NextRequest) {
  return normalizeCountryCode(
    request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      request.headers.get('x-country-code')
  );
}

function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

async function insertWithCountryFallback(db: any, table: 'photographers' | 'attendees', payload: Record<string, any>) {
  const withCountry = await db.from(table).insert(payload);
  if (!withCountry.error) return withCountry;
  if (!isMissingColumnError(withCountry.error, 'country_code')) return withCountry;

  const { country_code, ...legacyPayload } = payload;
  return db.from(table).insert(legacyPayload);
}

async function updateWithCountryFallback(db: any, table: 'photographers' | 'attendees', id: string, payload: Record<string, any>) {
  const withCountry = await db.from(table).update(payload).eq('id', id);
  if (!withCountry.error) return withCountry;
  if (!isMissingColumnError(withCountry.error, 'country_code')) return withCountry;

  const { country_code, ...legacyPayload } = payload;
  return db.from(table).update(legacyPayload).eq('id', id);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';
  const userTypeParam = requestUrl.searchParams.get('user_type');

  if (code) {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    const adminDb = serviceClient as any;
    const userDb = supabase as any;
    const detectedCountry = detectCountryFromRequest(request);
    
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the user to determine their type
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        if (detectedCountry) {
          await supabase.auth.updateUser({
            data: {
              ...(user.user_metadata || {}),
              country_code: detectedCountry,
            },
          }).catch(() => {});
        }

        // Determine user type from metadata or query param (for OAuth)
        let userType = normalizeUserType(user.user_metadata?.user_type);
        
        // For OAuth logins, user_type might be passed as query param
        if (!userType && userTypeParam) {
          userType = normalizeUserType(userTypeParam);
          
          // Update user metadata with the user type
          if (userType) {
            await supabase.auth.updateUser({
              data: { user_type: userType, country_code: detectedCountry }
            });
          }
        }
        
        // Default to attendee if no type specified
        if (!userType) {
          userType = 'attendee';
          await supabase.auth.updateUser({
            data: { user_type: userType, country_code: detectedCountry }
          });
        }
        
        // Check if profile exists, create if not (for OAuth users)
        if (isCreatorUser(userType)) {
          const { data: existingProfile } = await userDb
            .from('photographers')
            .select('id')
            .eq('id', user.id)
            .single();
          
          if (!existingProfile) {
            // Create photographer profile for OAuth user
            const displayName = user.user_metadata?.full_name || 
                               user.user_metadata?.name || 
                               user.email?.split('@')[0] || 
                               'Creator';
            
            // Generate username from display name
            const username = displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
            
            await insertWithCountryFallback(adminDb, 'photographers', {
              id: user.id,
              user_id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              country_code: detectedCountry,
              status: 'active',
              email_verified: true, // OAuth users are verified
            });
            
            // Create free subscription
            await adminDb.from('subscriptions').insert({
              photographer_id: user.id,
              plan_code: 'free',
              status: 'active',
            });
          } else {
            // Update existing profile
            await updateWithCountryFallback(userDb, 'photographers', user.id, { 
                email_verified: true,
                status: 'active',
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                country_code: detectedCountry,
              });
          }
        } else {
          const { data: existingProfile } = await userDb
            .from('attendees')
            .select('id')
            .eq('id', user.id)
            .single();
          
          if (!existingProfile) {
            // Create attendee profile for OAuth user
            const displayName = user.user_metadata?.full_name || 
                               user.user_metadata?.name || 
                               user.email?.split('@')[0] || 
                               'Attendee';
            
            const username = displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
            
            await insertWithCountryFallback(adminDb, 'attendees', {
              id: user.id,
              user_id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              country_code: detectedCountry,
              status: 'active',
              email_verified: true,
            });
          } else {
            await updateWithCountryFallback(userDb, 'attendees', user.id, { 
                email_verified: true,
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
                country_code: detectedCountry,
              });
          }
        }
        
        // Redirect based on user type
        const redirectPath = isCreatorUser(userType) ? '/dashboard' : '/gallery';
        return NextResponse.redirect(new URL(redirectPath, requestUrl.origin));
      }
      
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // If there's an error, redirect to login with error message
  return NextResponse.redirect(
    new URL('/login?message=Could not verify email. Please try again.', requestUrl.origin)
  );
}
