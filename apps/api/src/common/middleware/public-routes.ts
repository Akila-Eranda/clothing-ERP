/**
 * Routes reachable WITHOUT a tenant hint (no x-tenant-id header and no shop host). This must list
 * exactly the routes decorated with @Public(); public-routes.spec.ts fails if the two drift apart.
 *
 * Only TenantMiddleware uses this list, and it only decides whether a missing tenant hint is
 * acceptable. It never grants access: authentication and tenant isolation for every other route
 * are enforced by JwtAuthGuard + TenantGuard (the JWT tenant is authoritative).
 *
 * Paths are written WITHOUT the global prefix and version ("/auth/login", not "/api/v1/auth/login").
 * ":param" matches exactly one non-empty path segment.
 */
export const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/platform-login' },
  { method: 'POST', path: '/auth/impersonate-exchange' },
  { method: 'POST', path: '/auth/refresh' },
  { method: 'POST', path: '/auth/forgot-password' },
  { method: 'POST', path: '/auth/reset-password' },
  { method: 'POST', path: '/auth/kc-login' },
  { method: 'POST', path: '/auth/kc-refresh' },
  { method: 'POST', path: '/auth/kc-logout' },
  { method: 'GET', path: '/auth/kc-login-page' },
  { method: 'GET', path: '/tenants/shop-types' },
  { method: 'POST', path: '/tenants/register' },
  { method: 'GET', path: '/tenants/platform-status' },
  { method: 'GET', path: '/tenants/resolve-email' },
  { method: 'GET', path: '/tenants/resolve/:subdomain' },
];

/**
 * "/api/v1/auth/login/?x=1" → "/auth/login". Strips the query string, a trailing slash, the
 * "/api" prefix and a "/v<digits>" version segment. Collapses repeated slashes. Decodes nothing:
 * an encoded "%2F" stays inside its segment, so it can never turn one path into another.
 */
export function normalizeApiPath(originalUrl: string): string {
  let p = (originalUrl || '/').split('?')[0].split('#')[0];
  p = ('/' + p).replace(/\/{2,}/g, '/');
  p = p.replace(/^\/api(?=\/|$)/i, '');
  p = p.replace(/^\/v\d+(?=\/|$)/i, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

const compiled = PUBLIC_ROUTES.map((r) => ({
  method: r.method,
  re: new RegExp('^' + r.path.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$'),
}));

/** True only for an exact method + path match against PUBLIC_ROUTES. HEAD counts as GET. */
export function isPublicRoute(method: string, originalUrl: string): boolean {
  const m = (method || '').toUpperCase() === 'HEAD' ? 'GET' : (method || '').toUpperCase();
  const path = normalizeApiPath(originalUrl);
  return compiled.some((r) => r.method === m && r.re.test(path));
}
