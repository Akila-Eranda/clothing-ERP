/**
 * P1 task 1 — permission catalogue + no automatic role changes (customer-data policy).
 * Real PostgreSQL (DATABASE_URL, schema applied), real HTTP through the guards. Synthetic tenants only.
 *
 * Proves: login and GET /roles never modify an existing shop's roles; the catalogue permissions are
 * granted to nobody automatically; the reviewed per-tenant step is read-only by default, refuses a
 * wrong confirmation, changes only the confirmed tenant and writes an audit entry.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, RoleType } from '@prisma/client';

import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';
import databaseConfig from '../src/config/database.config';
import keycloakConfig from '../src/config/keycloak.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RolesModule } from '../src/modules/roles/roles.module';
import { UsersModule } from '../src/modules/users/users.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BranchContextInterceptor } from '../src/common/interceptors/branch-context.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { PERMISSION_CATALOGUE, splitPermissionKey } from '../src/shared/security/permission-catalogue';
import { ensureSystemRoles } from '../src/modules/roles/default-system-roles';
import { applySystemRoleReview, reviewSystemRoles } from '../src/modules/roles/system-role-review';

jest.setTimeout(120_000);

/** Legacy permission packs as an existing shop may have them today (differs from current defaults). */
const LEGACY = {
  'Tenant Admin': ['products:create', 'products:read', 'products:update', 'sales:read', 'accounting:create', 'accounting:read'],
  Cashier: ['sales:create', 'sales:read', 'products:read', 'products:update', 'inventory:update', 'accounting:create'],
  'Branch Manager': ['inventory:read', 'inventory:update', 'reports:read'],
};

describe('System roles: catalogue, no automatic changes, reviewed per-tenant step (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const PASSWORD = 'Synthetic@Pass2026';
  const tenants: Record<'a' | 'b', { id: string; adminEmail: string }> = {} as never;

  const http = () => request(app.getHttpServer());
  const keyOf = (p: { resource: string; action: string }) => `${p.resource}:${p.action}`;

  /** Ordered "role|permission" list for a tenant — any change to its roles changes this. */
  async function fingerprint(tenantId: string): Promise<string[]> {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { tenantId } },
      select: { role: { select: { name: true } }, permission: { select: { resource: true, action: true } } },
    });
    return rows.map((r) => `${r.role.name}|${keyOf(r.permission)}`).sort();
  }

  async function seedLegacyShop(label: 'a' | 'b') {
    const tenant = await prisma.tenant.create({
      data: { name: `Roles ${label} ${run}`, subdomain: `roles-${label}-${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main', code: 'MAIN' } });
    const perms = await prisma.permission.findMany();
    const idOf = new Map(perms.map((p) => [keyOf(p), p.id]));
    const roleIds: Record<string, string> = {};
    for (const [name, keys] of Object.entries(LEGACY)) {
      const type = name === 'Tenant Admin' ? RoleType.TENANT_ADMIN : name === 'Cashier' ? RoleType.CASHIER : RoleType.BRANCH_MANAGER;
      const role = await prisma.role.create({
        data: { tenantId: tenant.id, name, type, isSystem: true,
          permissions: { create: keys.map((k) => ({ permissionId: idOf.get(k)! })) } },
      });
      roleIds[name] = role.id;
    }
    const adminEmail = `admin-${label}-${run}@roles.test`;
    await prisma.user.create({
      data: { tenantId: tenant.id, branchId: branch.id, email: adminEmail, passwordHash: await bcrypt.hash(PASSWORD, 10),
        firstName: 'Admin', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: roleIds['Tenant Admin'] } } },
    });
    tenants[label] = { id: tenant.id, adminEmail };
  }

  async function loginToken(label: 'a' | 'b'): Promise<string> {
    const res = await http().post('/api/v1/auth/login').set('x-tenant-id', tenants[label].id)
      .send({ email: tenants[label].adminEmail, password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig, databaseConfig, keycloakConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        PrismaModule, AuthModule, RolesModule, UsersModule,
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

    // The migration's job, done here for a test DB built with db push: make sure the catalogue exists.
    for (const key of PERMISSION_CATALOGUE) {
      const { resource, action } = splitPermissionKey(key);
      await prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }
    await seedLegacyShop('a');
    await seedLegacyShop('b');
  });

  afterAll(async () => { await app?.close(); });

  it('the permission table contains every catalogue permission', async () => {
    const have = new Set((await prisma.permission.findMany()).map(keyOf));
    expect(PERMISSION_CATALOGUE.filter((k) => !have.has(k))).toEqual([]);
  });

  it('logging in does NOT modify an existing shop\'s roles', async () => {
    const before = await fingerprint(tenants.a.id);
    await loginToken('a');
    await loginToken('a');
    expect(await fingerprint(tenants.a.id)).toEqual(before);
  });

  it('listing roles (GET /roles) does NOT modify them', async () => {
    const token = await loginToken('a');
    const before = await fingerprint(tenants.a.id);
    const res = await http().get('/api/v1/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(await fingerprint(tenants.a.id)).toEqual(before);
  });

  it('new catalogue permissions are granted to nobody automatically (no escalation)', async () => {
    await loginToken('a');
    const keys = (await fingerprint(tenants.a.id)).map((r) => r.split('|')[1]);
    for (const newKey of ['accounting:update', 'accounting:delete', 'suppliers:update', 'suppliers:delete', 'returns:read', 'settings:read']) {
      expect(keys).not.toContain(newKey);
    }
  });

  it('review is read-only and reports the planned changes', async () => {
    const before = await fingerprint(tenants.a.id);
    const review = await reviewSystemRoles(prisma as unknown as PrismaClient, tenants.a.id);
    expect(await fingerprint(tenants.a.id)).toEqual(before);
    const admin = review.plans.find((p) => p.role === 'Tenant Admin')!;
    expect(admin.add).toEqual(expect.arrayContaining(['accounting:update', 'suppliers:update', 'returns:read']));
    const cashier = review.plans.find((p) => p.role === 'Cashier')!;
    expect(cashier.remove).toEqual(expect.arrayContaining(['accounting:create', 'inventory:update', 'products:update']));
  });

  it('apply refuses a wrong confirmation and changes nothing', async () => {
    const before = await fingerprint(tenants.a.id);
    await expect(applySystemRoleReview(prisma as unknown as PrismaClient, tenants.a.id, { confirmTenantId: tenants.b.id, actor: 'test' })).rejects.toThrow(/confirm/i);
    expect(await fingerprint(tenants.a.id)).toEqual(before);
  });

  it('add-only apply grants missing defaults and keeps every existing permission', async () => {
    const beforeA = await fingerprint(tenants.a.id);
    const beforeB = await fingerprint(tenants.b.id);
    await applySystemRoleReview(prisma as unknown as PrismaClient, tenants.a.id, { confirmTenantId: tenants.a.id, actor: 'test add-only', addOnly: true });
    const afterA = await fingerprint(tenants.a.id);
    for (const row of beforeA) expect(afterA).toContain(row);             // nothing removed
    expect(afterA).toContain('Tenant Admin|accounting:update');
    expect(afterA).toContain('Cashier|products:update');                  // kept in add-only mode
    expect(await fingerprint(tenants.b.id)).toEqual(beforeB);             // other shop untouched
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenants.a.id, action: 'system_roles.reviewed_update' }, orderBy: { createdAt: 'desc' } });
    expect(audit).not.toBeNull();
  });

  it('full apply brings the shop to the defaults, and a second review is empty', async () => {
    await applySystemRoleReview(prisma as unknown as PrismaClient, tenants.a.id, { confirmTenantId: tenants.a.id, actor: 'test full' });
    const after = await fingerprint(tenants.a.id);
    expect(after).not.toContain('Cashier|products:update');
    expect(after).not.toContain('Cashier|accounting:create');
    const again = await reviewSystemRoles(prisma as unknown as PrismaClient, tenants.a.id);
    expect(again.changes).toBe(0);
  });

  it('after the reviewed apply, Tenant Admin holds exactly the catalogue and can still sign in and list roles', async () => {
    const token = await loginToken('a');
    const me = await http().get('/api/v1/roles').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    const admin = (await fingerprint(tenants.a.id)).filter((r) => r.startsWith('Tenant Admin|')).map((r) => r.split('|')[1]);
    expect([...admin].sort()).toEqual([...PERMISSION_CATALOGUE].sort());
  });

  it('a brand-new tenant gets the full defaults at registration (ensureSystemRoles)', async () => {
    const t = await prisma.tenant.create({ data: { name: `Roles new ${run}`, subdomain: `roles-new-${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    await ensureSystemRoles(prisma, t.id);
    const admin = (await fingerprint(t.id)).filter((r) => r.startsWith('Tenant Admin|')).map((r) => r.split('|')[1]);
    expect([...admin].sort()).toEqual([...PERMISSION_CATALOGUE].sort());
  });
});
