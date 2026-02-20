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

function getMissingColumnName(error: any): string | null {
  if (error?.code !== '42703' || typeof error?.message !== 'string') return null;
  const quoted = error.message.match(/column\s+"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = error.message.match(/column\s+([a-zA-Z0-9_]+)/i);
  return bare?.[1] || null;
}

async function insertWithSchemaFallback(
  db: any,
  table: 'photographers' | 'attendees',
  payload: Record<string, any>
) {
  let attemptPayload = { ...payload };
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await db.from(table).insert(attemptPayload);
    if (!result.error) return result;

    const missingColumn = getMissingColumnName(result.error);
    if (!missingColumn || !(missingColumn in attemptPayload)) {
      return result;
    }
    delete attemptPayload[missingColumn];
  }
  return db.from(table).insert(attemptPayload);
}

async function updateWithSchemaFallback(
  db: any,
  table: 'photographers' | 'attendees',
  id: string,
  payload: Record<string, any>
) {
  let attemptPayload = { ...payload };
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await db.from(table).update(attemptPayload).eq('id', id);
    if (!result.error) return result;

    const missingColumn = getMissingColumnName(result.error);
    if (!missingColumn || !(missingColumn in attemptPayload)) {
      return result;
    }
    delete attemptPayload[missingColumn];
  }
  return db.from(table).update(attemptPayload).eq('id', id);
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
            
            await insertWithSchemaFallback(adminDb, 'photographers', {
              id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              profile_photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
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
            await updateWithSchemaFallback(userDb, 'photographers', user.id, {
                email_verified: true,
                status: 'active',
                profile_photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
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
            
            await insertWithSchemaFallback(adminDb, 'attendees', {
              id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              profile_photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              country_code: detectedCountry,
              status: 'active',
              email_verified: true,
            });
          } else {
            await updateWithSchemaFallback(userDb, 'attendees', user.id, {
                email_verified: true,
                profile_photo_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
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
