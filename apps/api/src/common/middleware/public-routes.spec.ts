import * as fs from 'fs';
import * as path from 'path';
import { isPublicRoute, normalizeApiPath, PUBLIC_ROUTES } from './public-routes';

/** Every route with @Public() in the source: "METHOD /controller-path/route-path". */
function publicRoutesInCode(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts') || p.endsWith('.spec.ts')) continue;
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      let base: string | null = null;
      let classPublic = false;
      let pending: string[] = [];
      for (const raw of lines) {
        const l = raw.trim();
        if (!l || l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue;
        const ctrl = l.match(/^@Controller\((.*)\)/);
        if (ctrl) {
          const m = ctrl[1].match(/path:\s*'([^']*)'/) || ctrl[1].match(/^'([^']*)'/);
          base = m ? m[1] : '';
          classPublic = pending.some((d) => d.startsWith('@Public('));
          pending = [];
          continue;
        }
        if (l.startsWith('@')) { pending.push(l); continue; }
        if (/^export class \w+/.test(l)) { if (pending.some((d) => d.startsWith('@Public('))) classPublic = true; pending = []; continue; }
        if (pending.length) {
          const http = pending.find((d) => /^@(Get|Post|Put|Patch|Delete)\(/.test(d));
          if (http && base !== null && (classPublic || pending.some((d) => d.startsWith('@Public(')))) {
            const hm = http.match(/^@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?/)!;
            found.push(`${hm[1].toUpperCase()} ${`/${base}/${hm[2] ?? ''}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')}`);
          }
          pending = [];
        }
      }
    }
  };
  walk(path.join(__dirname, '..', '..'));
  return found.sort();
}

describe('PUBLIC_ROUTES', () => {
  it('lists exactly the routes decorated with @Public()', () => {
    const listed = PUBLIC_ROUTES.map((r) => `${r.method} ${r.path}`).sort();
    expect(listed).toEqual(publicRoutesInCode());
  });
});

describe('normalizeApiPath', () => {
  it.each([
    ['/api/v1/auth/login', '/auth/login'],
    ['/api/v1/auth/login/', '/auth/login'],
    ['/api/v1/auth/login?redirect=/x', '/auth/login'],
    ['/api/v2/health', '/health'],
    ['/api/health', '/health'],
    ['//api//v1//health', '/health'],
    ['/API/V1/health', '/health'],
    ['/', '/'],
    ['', '/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeApiPath(input)).toBe(expected);
  });
});

describe('isPublicRoute', () => {
  it.each([
    ['GET', '/api/v1/health'],
    ['HEAD', '/api/v1/health'],
    ['GET', '/api/health'],
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/login/'],
    ['POST', '/api/v1/auth/refresh'],
    ['POST', '/api/v1/tenants/register'],
    ['GET', '/api/v1/tenants/platform-status'],
    ['GET', '/api/v1/tenants/resolve-email?email=a%40b.lk'],
    ['GET', '/api/v1/tenants/resolve/grocery'],
    ['get', '/api/v1/tenants/shop-types'],
  ])('public: %s %s', (method, url) => {
    expect(isPublicRoute(method, url)).toBe(true);
  });

  it.each([
    // wrong method for a public path
    ['GET', '/api/v1/auth/login'],
    ['DELETE', '/api/v1/health'],
    ['PUT', '/api/v1/tenants/register'],
    // look-alikes that the old "includes()" check would have let through
    ['GET', '/api/v1/audit-logs/login-history'],
    ['POST', '/api/v1/auth/login-anything'],
    ['GET', '/api/v1/customers/health'],
    ['GET', '/api/v1/reports/health'],
    ['GET', '/api/v1/tenants/resolve/grocery/users'],
    ['GET', '/api/v1/tenants/resolve/'],
    ['GET', '/api/v1/tenants/resolve-emails'],
    ['POST', '/api/v1/customers?next=/auth/login'],
    // path tricks
    ['POST', '/api/v1/auth/login/../../customers'],
    ['POST', '/api/v1/x/auth/login'],
    // ordinary protected routes
    ['GET', '/api/v1/customers'],
    ['POST', '/api/v1/pos/sale'],
    ['GET', '/api/v1/auth/me'],
    ['DELETE', '/api/v1/auth/logout'],
    ['POST', '/api/v1/auth/change-password'],
  ])('protected: %s %s', (method, url) => {
    expect(isPublicRoute(method, url)).toBe(false);
  });

  it('treats an encoded slash as part of one segment, never as a separator', () => {
    // ":subdomain" matches one segment; "a%2F..%2Fusers" is one (odd) segment → still the resolve route,
    // which is harmless (it only looks up a subdomain), and cannot reach another route.
    expect(isPublicRoute('GET', '/api/v1/tenants/resolve/a%2Fb')).toBe(true);
    expect(normalizeApiPath('/api/v1/tenants/resolve/a%2Fb')).toBe('/tenants/resolve/a%2Fb');
  });
});
