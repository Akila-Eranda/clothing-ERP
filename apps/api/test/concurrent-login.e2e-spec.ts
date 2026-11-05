/**
 * Regression: same-second logins (production bug found 3 Nov 2026). Before the fix, two logins of the
 * same user within one second produced byte-identical JWTs and the unique sessions.token constraint
 * failed the second login with 409. Every token now carries a random jti.
 *
 * Real PostgreSQL (DATABASE_URL, schema applied), real HTTP through the guards. Synthetic users only.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { RoleType } from '@prisma/client';

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
import { hashSessionToken } from '../src/shared/security/session-token';

jest.setTimeout(120_000);

const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Concurrent logins: double click, multiple tabs, several devices (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;
  const run = Date.now().toString(36);
  const PASSWORD = 'Synthetic@Pass2026';
  let tenantId: string;
  let adminId: string;
  let adminEmail: string;
  let cashierEmail: string;

  const http = () => request(app.getHttpServer());
  const login = (email: string, ua = 'jest') =>
    http().post('/api/v1/auth/login').set('x-tenant-id', tenantId).set('user-agent', ua).send({ email, password: PASSWORD });
  const sessionsOf = (userId: string) => prisma.session.findMany({ where: { userId } });

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
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    const tenant = await prisma.tenant.create({
      data: { name: `Login ${run}`, subdomain: `login-${run}`, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    tenantId = tenant.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } });
    const perm = await prisma.permission.upsert({ where: { resource_action: { resource: 'users', action: 'read' } }, update: {}, create: { resource: 'users', action: 'read' } });
    const adminRole = await prisma.role.create({ data: { tenantId, name: `Admin ${run}`, type: RoleType.TENANT_ADMIN, permissions: { create: [{ permissionId: perm.id }] } } });
    const cashierRole = await prisma.role.create({ data: { tenantId, name: `Cashier ${run}`, type: RoleType.CASHIER } });
    const hash = await bcrypt.hash(PASSWORD, 10);
    adminEmail = `admin-${run}@login.test`;
    cashierEmail = `cashier-${run}@login.test`;
    const admin = await prisma.user.create({ data: { tenantId, branchId: branch.id, email: adminEmail, passwordHash: hash, firstName: 'A', lastName: 'Dmin', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: adminRole.id } } } });
    adminId = admin.id;
    await prisma.user.create({ data: { tenantId, branchId: branch.id, email: cashierEmail, passwordHash: hash, firstName: 'C', lastName: 'Ashier', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: cashierRole.id } } } });
  });

  afterAll(async () => { await app?.close(); });

  it('double click: two simultaneous logins both succeed with distinct tokens and sessions', async () => {
    const before = (await sessionsOf(adminId)).length;
    let sameSecondPairs = 0;
    let ta = '', tb = '';
    for (let round = 0; round < 5; round++) {
      const [a, b] = await Promise.all([login(adminEmail), login(adminEmail)]);
      expect(a.status).toBeLessThan(300);   // used to be 409 for the second click
      expect(b.status).toBeLessThan(300);
      [ta, tb] = [a.body.data.accessToken, b.body.data.accessToken];
      expect(ta).not.toBe(tb);
      expect(decode(ta).jti).toMatch(UUID_V4);
      expect(decode(tb).jti).toMatch(UUID_V4);
      expect(decode(ta).jti).not.toBe(decode(tb).jti);
      if (decode(ta).iat === decode(tb).iat) sameSecondPairs++;
    }
    expect(sameSecondPairs).toBeGreaterThan(0); // the exact case that failed before the fix was exercised
    expect((await sessionsOf(adminId)).length).toBe(before + 10);
    for (const t of [ta, tb]) {
      const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`);
      expect(me.status).toBe(200);
    }
  });

  it('multiple tabs: five simultaneous logins all succeed; tokens, refresh tokens and sessions are all distinct', async () => {
    const before = (await sessionsOf(adminId)).length;
    const res = await Promise.all(Array.from({ length: 5 }, (_, i) => login(adminEmail, `tab-${i}`)));
    expect(res.map((r) => r.status).every((s) => s < 300)).toBe(true);
    const access = res.map((r) => r.body.data.accessToken);
    const refresh = res.map((r) => r.body.data.refreshToken);
    expect(new Set(access).size).toBe(5);
    expect(new Set(refresh).size).toBe(5);
    expect(new Set(refresh.map((t) => decode(t).jti)).size).toBe(5);
    const sessions = await sessionsOf(adminId);
    expect(sessions.length).toBe(before + 5);
    for (const t of access) expect(sessions.some((s) => s.token === hashSessionToken(t))).toBe(true);
  });

  it('several devices: simultaneous logins from three devices keep one session per device', async () => {
    const devices = ['POS-terminal-1 (Windows)', 'Owner phone (Android)', 'Back-office laptop (macOS)'];
    const res = await Promise.all(devices.map((ua) => login(adminEmail, ua)));
    expect(res.every((r) => r.status < 300)).toBe(true);
    const sessions = await sessionsOf(adminId);
    for (const [i, ua] of devices.entries()) {
      const s = sessions.find((x) => x.token === hashSessionToken(res[i].body.data.accessToken));
      expect(s?.userAgent).toBe(ua);
      expect(s?.isActive).toBe(true);
    }
  });

  it('two tabs refreshing at the same moment both get new, distinct tokens', async () => {
    const [l1, l2] = await Promise.all([login(adminEmail, 'tab-A'), login(adminEmail, 'tab-B')]);
    const [r1, r2] = await Promise.all([
      http().post('/api/v1/auth/refresh').set('x-tenant-id', tenantId).send({ refreshToken: l1.body.data.refreshToken }),
      http().post('/api/v1/auth/refresh').set('x-tenant-id', tenantId).send({ refreshToken: l2.body.data.refreshToken }),
    ]);
    expect(r1.status).toBeLessThan(300);
    expect(r2.status).toBeLessThan(300);
    expect(r1.body.data.accessToken).not.toBe(r2.body.data.accessToken);
    expect(r1.body.data.refreshToken).not.toBe(r2.body.data.refreshToken);
  });

  it('logging out one tab deactivates only that tab\'s session', async () => {
    const [x, y] = await Promise.all([login(adminEmail, 'tab-X'), login(adminEmail, 'tab-Y')]);
    const tx = x.body.data.accessToken; const ty = y.body.data.accessToken;
    const out = await http().delete('/api/v1/auth/logout').set('Authorization', `Bearer ${tx}`);
    expect(out.status).toBeLessThan(300);
    const sessions = await sessionsOf(adminId);
    expect(sessions.find((s) => s.token === hashSessionToken(tx))?.isActive).toBe(false);
    expect(sessions.find((s) => s.token === hashSessionToken(ty))?.isActive).toBe(true);
  });

  it('tokens issued before the fix (no jti) are still accepted', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const legacy = await jwt.signAsync(
      { sub: user.id, email: user.email, tenantId, roles: [RoleType.TENANT_ADMIN], permissions: [] },
      { secret: config.get('jwt.accessSecret'), expiresIn: '15m', issuer: config.get('jwt.issuer'), audience: config.get('jwt.audience') },
    );
    expect(decode(legacy).jti).toBeUndefined();
    const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${legacy}`);
    expect(me.status).toBe(200);
  });

  it('token validation is unchanged: forged and expired tokens are rejected', async () => {
    const forged = await jwt.signAsync({ sub: adminId, email: adminEmail, tenantId, roles: [], permissions: [] },
      { secret: 'not-the-real-secret', expiresIn: '15m', issuer: config.get('jwt.issuer'), audience: config.get('jwt.audience'), jwtid: 'x' });
    expect((await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    const expired = await jwt.signAsync({ sub: adminId, email: adminEmail, tenantId, roles: [], permissions: [] },
      { secret: config.get('jwt.accessSecret'), expiresIn: -10, issuer: config.get('jwt.issuer'), audience: config.get('jwt.audience'), jwtid: 'y' });
    expect((await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });

  it('authorization is unchanged: concurrent logins do not widen permissions', async () => {
    const [admin, cashier] = await Promise.all([login(adminEmail), login(cashierEmail)]);
    const asAdmin = await http().get('/api/v1/users').set('Authorization', `Bearer ${admin.body.data.accessToken}`);
    const asCashier = await http().get('/api/v1/users').set('Authorization', `Bearer ${cashier.body.data.accessToken}`);
    expect(asAdmin.status).toBe(200);
    expect(asCashier.status).toBe(403);
  });

  it('existing session rows are not modified by new logins', async () => {
    const legacy = await prisma.session.create({
      data: { userId: adminId, token: `legacy-raw-token-${run}`, expiresAt: new Date(Date.now() + 60_000) },
    });
    await Promise.all([login(adminEmail), login(adminEmail)]);
    const after = await prisma.session.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after).toEqual(legacy);
  });
});
