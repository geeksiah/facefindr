import { jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getAdminJwtSecretBytes } from './lib/jwt-secret';

const COOKIE_NAME = 'admin_session';

// Public routes that don't require authentication
const publicRoutes = ['/login', '/api/auth/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets without requiring admin auth (logos, fonts, etc.)
  const isStaticAssetRequest =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.[a-zA-Z0-9]+$/.test(pathname);
  if (isStaticAssetRequest) {
    return NextResponse.next();
  }
  
  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Check for session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  
  if (!token) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  let jwtSecret: Uint8Array;
  try {
    jwtSecret = getAdminJwtSecretBytes();
  } catch {
    return new NextResponse('Admin authentication is not configured', { status: 503 });
  }
  
  // Verify token
  try {
    await jwtVerify(token, jwtSecret);
    return NextResponse.next();
  } catch {
    // Invalid token, redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
