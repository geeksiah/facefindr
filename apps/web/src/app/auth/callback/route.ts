import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';
  const userTypeParam = requestUrl.searchParams.get('user_type');

  if (code) {
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the user to determine their type
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Determine user type from metadata or query param (for OAuth)
        let userType = user.user_metadata?.user_type as 'photographer' | 'attendee' | undefined;
        
        // For OAuth logins, user_type might be passed as query param
        if (!userType && userTypeParam) {
          userType = userTypeParam as 'photographer' | 'attendee';
          
          // Update user metadata with the user type
          await supabase.auth.updateUser({
            data: { user_type: userType }
          });
        }
        
        // Default to attendee if no type specified
        if (!userType) {
          userType = 'attendee';
          await supabase.auth.updateUser({
            data: { user_type: userType }
          });
        }
        
        // Check if profile exists, create if not (for OAuth users)
        if (userType === 'photographer') {
          const { data: existingProfile } = await supabase
            .from('photographers')
            .select('id')
            .eq('id', user.id)
            .single();
          
          if (!existingProfile) {
            // Create photographer profile for OAuth user
            const displayName = user.user_metadata?.full_name || 
                               user.user_metadata?.name || 
                               user.email?.split('@')[0] || 
                               'Photographer';
            
            // Generate username from display name
            const username = displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
            
            await serviceClient.from('photographers').insert({
              id: user.id,
              user_id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              status: 'active',
              email_verified: true, // OAuth users are verified
            });
            
            // Create free subscription
            await serviceClient.from('subscriptions').insert({
              photographer_id: user.id,
              plan_code: 'free',
              status: 'active',
            });
          } else {
            // Update existing profile
            await supabase
              .from('photographers')
              .update({ 
                email_verified: true,
                status: 'active',
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              })
              .eq('id', user.id);
          }
        } else {
          const { data: existingProfile } = await supabase
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
            
            await serviceClient.from('attendees').insert({
              id: user.id,
              user_id: user.id,
              email: user.email,
              display_name: displayName,
              username: username,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              status: 'active',
              email_verified: true,
            });
          } else {
            await supabase
              .from('attendees')
              .update({ 
                email_verified: true,
                avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
              })
              .eq('id', user.id);
          }
        }
        
        // Redirect based on user type
        const redirectPath = userType === 'photographer' ? '/dashboard' : '/gallery';
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
