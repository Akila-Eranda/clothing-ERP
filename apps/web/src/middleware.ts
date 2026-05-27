import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin panel has its own client-side auth guard — skip tenant middleware entirely
  if (pathname.startsWith('/admin')) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // The token is stored in localStorage (client-side only).
  // We fall back to a cookie-based check for SSR protection.
  // The client-side layout guard handles the final redirect.
  const token = request.cookies.get('fe_access_token')?.value;

  // If accessing a protected route without a token cookie, redirect to /login
  if (!isPublic && !token && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If already logged in and hitting auth pages, redirect to /dashboard
  if (isPublic && token) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
};
