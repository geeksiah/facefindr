import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Get the user to determine their type
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const userType = user.user_metadata?.user_type;
        
        // Update email_verified status in the appropriate table
        if (userType === 'photographer') {
          await supabase
            .from('photographers')
            .update({ 
              email_verified: true,
              status: 'active'
            })
            .eq('id', user.id);
        } else if (userType === 'attendee') {
          await supabase
            .from('attendees')
            .update({ email_verified: true })
            .eq('id', user.id);
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
