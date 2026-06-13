import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPosOnlyFromApiRoles, POS_HOME_PATH } from '@/lib/role-access';

function rolesFromAccessToken(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { roles?: string[] };
    return payload.roles ?? [];
  } catch {
    return [];
  }
}

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

/** Hostnames allowed to serve /admin (company console). */
const ADMIN_HOSTS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_HOSTS || 'admin3.hexalyte.com,localhost')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

function isAdminHost(request: NextRequest): boolean {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  return ADMIN_HOSTS.has(host);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Force HTTPS when proxied over HTTP (tenant subdomains must use TLS)
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http') {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = 'https';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // Company admin panel — only on admin3 (not shop / tenant domains)
  if (pathname.startsWith('/admin')) {
    if (!isAdminHost(request)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const token = request.cookies.get('fe_access_token')?.value;

  if (!isPublic && !token && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublic && token) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = isPosOnlyFromApiRoles(rolesFromAccessToken(token))
      ? POS_HOME_PATH
      : '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
};
