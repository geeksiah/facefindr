import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/events', '/settings', '/gallery', '/photos'];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/register', '/forgot-password'];

function isCreatorUser(userType: unknown): boolean {
  return userType === 'photographer' || userType === 'creator';
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Check if route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // Redirect unauthenticated users away from protected routes
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth routes
  if (isAuthRoute && user) {
    const userType = user.user_metadata?.user_type;
    const redirectPath = isCreatorUser(userType) ? '/dashboard' : '/gallery';
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  // Role-based route protection
  if (user) {
    const userType = user.user_metadata?.user_type;
    
    // Creator-only routes
    const photographerRoutes = ['/dashboard', '/events', '/settings/payout'];
    const isCreatorRoute = photographerRoutes.some((route) => pathname.startsWith(route));
    
    if (isCreatorRoute && !isCreatorUser(userType)) {
      return NextResponse.redirect(new URL('/gallery', request.url));
    }
    
    // Attendee-only routes  
    const attendeeRoutes = ['/gallery', '/photos', '/passport'];
    const isAttendeeRoute = attendeeRoutes.some((route) => pathname.startsWith(route));
    
    if (isAttendeeRoute && userType !== 'attendee') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}
