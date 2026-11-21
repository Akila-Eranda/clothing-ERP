/**
 * P1 task 2 — public routes vs tenant context, through the REAL TenantMiddleware mounted exactly like
 * AppModule (forRoutes('*')), plus the global guards. Real PostgreSQL (DATABASE_URL). Synthetic shops.
 *
 * Covers: public health/status/registration/resolve routes without a tenant; login bound to exactly one
 * shop (header or shop host), never a cross-shop email lookup; tenant resolution by id or subdomain;
 * authenticated routes with valid/missing/invalid tenant context; cross-tenant attempts; route-matching
 * edge cases (look-alike paths, trailing slash, query strings, wrong methods).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, MiddlewareConsumer, Module, NestModule, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { RoleType } from '@prisma/client';

import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';
import databaseConfig from '../src/config/database.config';
import keycloakConfig from '../src/config/keycloak.config';
import mailConfig from '../src/config/mail.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { TenantsModule } from '../src/modules/tenants/tenants.module';
import { HealthModule } from '../src/health/health.module';
import { CustomersModule } from '../src/modules/customers/customers.module';
import { RolesModule } from '../src/modules/roles/roles.module';
import { UsersModule } from '../src/modules/users/users.module';
import { TenantMiddleware } from '../src/common/middleware/tenant.middleware';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BranchContextInterceptor } from '../src/common/interceptors/branch-context.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

jest.setTimeout(120_000);

/** Applies the middleware exactly as AppModule.configure() does. */
@Module({})
class TenantMiddlewareHost implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

type Shop = { id: string; subdomain: string; token?: string; customerId: string };

describe('Tenant middleware: public routes, tenant resolution and isolation (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const SHARED_EMAIL = `owner-${run}@shared.test`; // the same email exists in BOTH shops
  const PASS_A = 'Shop-A@Pass2026';
  const PASS_B = 'Shop-B@Pass2026';
  const shops: Record<'a' | 'b', Shop> = {} as never;

  // Default Host is "localhost". supertest's own default (127.0.0.1) has 4 dot-separated parts, so the
  // existing host rule (>= 3 labels = shop hint) would treat it as shop "127" and hide missing-tenant cases.
  const http = () => {
    const agent = request(app.getHttpServer());
    const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head') => (url: string) => agent[m](url).set('Host', 'localhost');
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), head: wrap('head') };
  };
  const loginTo = (s: 'a' | 'b', password: string, headers: Record<string, string> = { 'x-tenant-id': shops[s].subdomain }) =>
    http().post('/api/v1/auth/login').set(headers).send({ email: SHARED_EMAIL, password });

  async function seedShop(label: 'a' | 'b', password: string) {
    const subdomain = `mw${label}${run}`;
    const tenant = await prisma.tenant.create({ data: { name: `MW ${label} ${run}`, subdomain, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main', code: 'MAIN' } });
    const perms = await Promise.all(['customers:read', 'customers:update'].map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: tenant.id, name: `Admin ${label}`, type: RoleType.TENANT_ADMIN, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    await prisma.user.create({ data: { tenantId: tenant.id, branchId: branch.id, email: SHARED_EMAIL, passwordHash: await bcrypt.hash(password, 10), firstName: 'Owner', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } } });
    const customer = await prisma.customer.create({ data: { tenantId: tenant.id, firstName: `Secret ${label}`, lastName: 'Customer', phone: `07${label === 'a' ? 1 : 2}${Date.now() % 1e7}` } });
    shops[label] = { id: tenant.id, subdomain, customerId: customer.id };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig, databaseConfig, keycloakConfig, mailConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        ScheduleModule.forRoot(),
        PrismaModule, AuthModule, TenantsModule, HealthModule, CustomersModule, RolesModule, UsersModule,
        TenantMiddlewareHost,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: BranchContextInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await seedShop('a', PASS_A);
    await seedShop('b', PASS_B);
    shops.a.token = (await loginTo('a', PASS_A)).body.data?.accessToken;
    shops.b.token = (await loginTo('b', PASS_B)).body.data?.accessToken;
  });

  afterAll(async () => { await app?.close(); });

  // ── 1. Public health and status endpoints ─────────────────
  describe('1. public health and status (no tenant, no token)', () => {
    it('GET /health → 200', async () => { expect((await http().get('/api/v1/health')).status).toBe(200); });
    it('GET /health/ (trailing slash) → 200', async () => { expect((await http().get('/api/v1/health/')).status).toBe(200); });
    it('HEAD /health → 200', async () => { expect((await http().head('/api/v1/health')).status).toBe(200); });
    it('GET /tenants/platform-status → 200', async () => { expect((await http().get('/api/v1/tenants/platform-status')).status).toBe(200); });
    it('GET /tenants/shop-types → 200', async () => { expect((await http().get('/api/v1/tenants/shop-types')).status).toBe(200); });
    it('GET /tenants/resolve/:subdomain → 200 for a known shop, only public fields', async () => {
      const r = await http().get(`/api/v1/tenants/resolve/${shops.a.subdomain}`);
      expect(r.status).toBe(200);
      expect(Object.keys(r.body.data).sort()).toEqual(['name', 'shopType', 'status', 'subdomain']);
    });
    it('GET /tenants/resolve/:subdomain → 404 for an unknown shop', async () => {
      expect((await http().get(`/api/v1/tenants/resolve/nope-${run}`)).status).toBe(404);
    });
    it('GET /tenants/resolve-email → 200 without a tenant', async () => {
      expect((await http().get(`/api/v1/tenants/resolve-email?email=nobody-${run}%40x.test`)).status).toBe(200);
    });
  });

  // ── 2. Login and registration without an existing tenant session ─
  describe('2. login and registration without a session', () => {
    it('login with x-tenant-id (subdomain) → 200', async () => {
      expect((await loginTo('a', PASS_A)).status).toBe(200);
    });
    it('login from a shop host (Origin: {shop}.shop.hexalyte.com, no header) → 200 for that shop', async () => {
      const r = await loginTo('b', PASS_B, { origin: `https://${shops.b.subdomain}.shop.hexalyte.com` });
      expect(r.status).toBe(200);
      expect(r.body.data.user.tenantId).toBe(shops.b.id);
    });
    it('login with no shop at all → 400, never a cross-shop email lookup', async () => {
      const r = await http().post('/api/v1/auth/login').send({ email: SHARED_EMAIL, password: PASS_B });
      expect(r.status).toBe(400);
      expect(r.body.data).toBeUndefined();
    });
    it('the same email in two shops: each password only opens its own shop', async () => {
      expect((await loginTo('a', PASS_B)).status).toBe(401);
      expect((await loginTo('b', PASS_A)).status).toBe(401);
    });
    it('login to an unknown workspace → 401, not a fallback to another shop', async () => {
      const r = await http().post('/api/v1/auth/login').set('x-tenant-id', `ghost-${run}`).send({ email: SHARED_EMAIL, password: PASS_A });
      expect(r.status).toBe(401);
    });
    it('refresh works without a tenant header', async () => {
      const l = await loginTo('a', PASS_A);
      const r = await http().post('/api/v1/auth/refresh').send({ refreshToken: l.body.data.refreshToken });
      expect(r.status).toBeLessThan(300);
    });
    it('registration works without a tenant and creates a separate shop', async () => {
      const sub = `mwreg${run}`;
      const r = await http().post('/api/v1/tenants/register').send({
        companyName: `Reg ${run}`, subdomain: sub, adminEmail: `reg-${run}@x.test`, adminPassword: 'Register@2026', adminFirstName: 'Reg', adminLastName: 'Owner',
      });
      expect(r.status).toBeLessThan(300);
      const t = await prisma.tenant.findUnique({ where: { subdomain: sub } });
      expect(t).not.toBeNull();
      expect([shops.a.id, shops.b.id]).not.toContain(t!.id);
    });
  });

  // ── 3. Correct tenant resolution ─────────────────────────
  describe('3. tenant resolution', () => {
    it('x-tenant-id by id or by subdomain resolves the same shop', async () => {
      const bySub = await loginTo('a', PASS_A, { 'x-tenant-id': shops.a.subdomain });
      const byId = await loginTo('a', PASS_A, { 'x-tenant-id': shops.a.id });
      expect(bySub.body.data.user.tenantId).toBe(shops.a.id);
      expect(byId.body.data.user.tenantId).toBe(shops.a.id);
    });
    it('the x-tenant-id header wins over a different shop host', async () => {
      const r = await loginTo('a', PASS_A, { 'x-tenant-id': shops.a.subdomain, origin: `https://${shops.b.subdomain}.shop.hexalyte.com` });
      expect(r.body.data.user.tenantId).toBe(shops.a.id);
    });
  });

  // ── 4. Authenticated routes with valid tenant context ──────
  describe('4. authenticated routes, valid context', () => {
    it('own shop: GET /customers → 200 with only own customers', async () => {
      const r = await http().get('/api/v1/customers?limit=100').set('Authorization', `Bearer ${shops.a.token}`).set('x-tenant-id', shops.a.subdomain);
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.body);
      expect(text).toContain('Secret a');
      expect(text).not.toContain('Secret b');
    });
  });

  // ── 5. Missing or invalid tenant context ───────────────────
  describe('5. missing or invalid tenant context', () => {
    it('protected route, no token, no tenant → 400 (tenant required)', async () => {
      expect((await http().get('/api/v1/customers')).status).toBe(400);
    });
    it('protected route, token but no tenant hint → 400 (unchanged rule)', async () => {
      expect((await http().get('/api/v1/customers').set('Authorization', `Bearer ${shops.a.token}`)).status).toBe(400);
    });
    it('protected route, tenant header but no token → 401', async () => {
      expect((await http().get('/api/v1/customers').set('x-tenant-id', shops.a.subdomain)).status).toBe(401);
    });
    it('protected route, token + unknown tenant header → 403', async () => {
      const r = await http().get('/api/v1/customers').set('Authorization', `Bearer ${shops.a.token}`).set('x-tenant-id', `ghost-${run}`);
      expect(r.status).toBe(403);
    });
  });

  // ── 6. Cross-tenant access attempts ──────────────────────
  describe('6. cross-tenant attempts', () => {
    it('shop A token + shop B header → 403, no data', async () => {
      const r = await http().get('/api/v1/customers').set('Authorization', `Bearer ${shops.a.token}`).set('x-tenant-id', shops.b.subdomain);
      expect(r.status).toBe(403);
      expect(JSON.stringify(r.body)).not.toContain('Secret b');
    });
    it('shop A token reading shop B customer by id → 404', async () => {
      const r = await http().get(`/api/v1/customers/${shops.b.customerId}`).set('Authorization', `Bearer ${shops.a.token}`).set('x-tenant-id', shops.a.subdomain);
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.body)).not.toContain('Secret b');
    });
    it('shop A token updating shop B customer → 404 and the record is unchanged', async () => {
      const before = await prisma.customer.findUniqueOrThrow({ where: { id: shops.b.customerId } });
      const r = await http().put(`/api/v1/customers/${shops.b.customerId}`).set('Authorization', `Bearer ${shops.a.token}`).set('x-tenant-id', shops.a.subdomain).send({ city: 'hijacked' });
      expect(r.status).toBe(404);
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: shops.b.customerId } })).toEqual(before);
    });
    it('a public route does not leak tenant data: resolve returns only branding fields', async () => {
      const r = await http().get(`/api/v1/tenants/resolve/${shops.b.subdomain}`).set('Authorization', `Bearer ${shops.a.token}`);
      expect(JSON.stringify(r.body)).not.toContain('Secret b');
      expect(JSON.stringify(r.body)).not.toContain(SHARED_EMAIL);
    });
  });

  // ── 8. Route matching edge cases (no tenant supplied) ─────
  describe('8. public-route matching edge cases', () => {
    it.each([
      ['GET', '/api/v1/audit-logs/login-history'],
      ['POST', '/api/v1/auth/login-anything'],
      ['GET', '/api/v1/customers/health'],
      ['GET', '/api/v1/customers?next=/auth/login'],
      ['GET', '/api/v1/auth/login'],
      ['DELETE', '/api/v1/health'],
      ['GET', '/api/v1/tenants/resolve/x/users'],
    ])('%s %s is NOT treated as public (tenant still required)', async (method, url) => {
      const r = await (http() as unknown as Record<string, (u: string) => request.Test>)[method.toLowerCase()](url);
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toMatch(/Tenant identifier is required/);
    });
    it('POST /auth/login/ with a trailing slash is still the login route', async () => {
      const r = await http().post('/api/v1/auth/login/').set('x-tenant-id', shops.a.subdomain).send({ email: SHARED_EMAIL, password: PASS_A });
      expect(r.status).toBe(200);
    });
  });
});
