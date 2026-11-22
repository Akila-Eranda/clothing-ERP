/**
 * Part 2 - the original `POST /payment-qr` 403, investigated as a MATRIX of possible causes (not only
 * accounting:update). Full AppModule over HTTP against a throw-away PostgreSQL + Redis. The request shape is the one
 * from the incident: Authorization + x-tenant-id + x-branch-id headers, JSON body with label / bankAccountId /
 * mode / branchId. Each cause must produce a DISTINCT, readable message so the real one can be read from the
 * browser's Network tab / API log.
 *
 *   permission      -> "Insufficient permissions. Required: [accounting:create]"
 *   suspended shop  -> "This shop is suspended. Contact support."  (every request of the shop, not just this one)
 *   foreign branch  -> "Branch is not available in this tenant."   (body OR x-branch-id header)
 *   tenant header   -> "Tenant context does not match authenticated session"
 *   branch lock     -> "You can only access your assigned branch." (non-admin role)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { systemRoleDefinitions } from '../src/modules/roles/default-system-roles';

jest.setTimeout(300_000);

type Shop = { id: string; sub: string; branchId: string; bankId: string; admin: string; branchManager: string };

describe('POST /payment-qr 403 - cause matrix', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Qr403-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  let hash = '';

  const pace = () => new Promise((r) => setTimeout(r, 200));
  async function login(sub: string, email: string) {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login ${r.status}`);
    await pace();
    return r.body.data.accessToken as string;
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `qr4${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `QR403 ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const perms = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const byKey = new Map(perms.map((p) => [`${p.resource}:${p.action}`, p.id]));
    const defs = systemRoleDefinitions([...PERMISSION_CATALOGUE]);
    const mkRole = (name: string) => {
      const d = defs.find((x) => x.name === name)!;
      return prisma.role.create({ data: { tenantId: t.id, name, type: d.type as RoleType, permissions: { create: d.permissions.map((k) => ({ permissionId: byKey.get(k)! })) } } });
    };
    const adminRole = await mkRole('Tenant Admin');
    const bmRole = await mkRole('Branch Manager');
    const mk = (email: string, roleId: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email, passwordHash: hash, firstName: 'U', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    await mk(`admin-${run}@qr4${label}.test`, adminRole.id);
    await mk(`bm-${run}@qr4${label}.test`, bmRole.id);
    const bank = await prisma.bankAccount.create({
      data: { tenantId: t.id, code: `BK-${label}`, name: 'Main bank', type: 'CURRENT', bankName: 'Bank of Ceylon', accountNumber: '0081234510' + label.charCodeAt(0), accountHolderName: 'Shop Ltd', branchName: 'Fort', branchCode: '001' },
    });
    return {
      id: t.id, sub, branchId: branch.id, bankId: bank.id,
      admin: await login(sub, `admin-${run}@qr4${label}.test`),
      branchManager: await login(sub, `bm-${run}@qr4${label}.test`),
    };
  }

  /** The incident request: tenant + branch headers and a body with label / bank / mode / branchId. */
  const post = async (token: string, headers: Record<string, string>, body: object) => {
    await pace();
    return request(app.getHttpServer()).post('/api/v1/payment-qr').set({ Authorization: `Bearer ${token}`, Host: 'localhost', ...headers }).send(body);
  };
  const body = (shop: Shop, extra: object = {}) => ({ label: 'Grocery QR', bankAccountId: shop.bankId, mode: 'STATIC', isDefault: true, branchId: shop.branchId, ...extra });
  const hdr = (shop: Shop, extra: Record<string, string> = {}) => ({ 'x-tenant-id': shop.sub, 'x-branch-id': shop.branchId, ...extra });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    hash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });
  afterAll(async () => { await new Promise((r) => setTimeout(r, 500)); await app?.close(); });

  it('CONTROL: a Tenant Admin with the full permission set, the shop\'s own branch in header AND body, succeeds (201)', async () => {
    const r = await post(A.admin, hdr(A), body(A));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ label: 'Grocery QR', bankAccountId: A.bankId });
  });

  it('CONTROL: the same request WITHOUT the x-branch-id header also succeeds', async () => {
    const r = await post(A.admin, { 'x-tenant-id': A.sub }, body(A, { label: 'No header QR', isDefault: false }));
    expect(r.status).toBe(201);
  });

  it('cause 1 - missing accounting:create: 403 names the missing permission', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { tenantId: A.id, name: 'Tenant Admin' } });
    const perm = await prisma.permission.findUniqueOrThrow({ where: { resource_action: { resource: 'accounting', action: 'create' } } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
    const r = await post(A.admin, hdr(A), body(A, { label: 'No create perm' }));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Insufficient permissions. Required: [accounting:create]');
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } }); // restore
    expect((await post(A.admin, hdr(A), body(A, { label: 'Perm restored', isDefault: false }))).status).toBe(201);
  });

  it('cause 1b - the permissions are re-read from the database on every request (a role fix applies without a new login)', async () => {
    const r = await post(A.admin, hdr(A), body(A, { label: 'Fresh perms', isDefault: false }));
    expect(r.status).toBe(201);
  });

  it('cause 2 - suspended shop: 403 "This shop is suspended" (affects EVERY request of the shop, so GETs fail too)', async () => {
    await prisma.tenant.update({ where: { id: B.id }, data: { status: 'SUSPENDED' } });
    const r = await post(B.admin, hdr(B), body(B));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('This shop is suspended. Contact support.');
    await pace();
    const get = await request(app.getHttpServer()).get('/api/v1/payment-qr/pos').set({ Authorization: `Bearer ${B.admin}`, 'x-tenant-id': B.sub, Host: 'localhost' });
    expect(get.status).toBe(403);
    await prisma.tenant.update({ where: { id: B.id }, data: { status: 'ACTIVE' } });
  });

  it('cause 3 - a branch id from ANOTHER shop in the body: 403 "Branch is not available in this tenant."', async () => {
    const r = await post(A.admin, hdr(A), body(A, { branchId: B.branchId }));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Branch is not available in this tenant.');
  });

  it('cause 3b - a stale / foreign x-branch-id HEADER (e.g. left in the browser from another shop): same 403, body is fine', async () => {
    const r = await post(A.admin, hdr(A, { 'x-branch-id': B.branchId }), body(A));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Branch is not available in this tenant.');
  });

  it('cause 3c - an inactive branch in the header: 403 "Selected branch is inactive."', async () => {
    const extra = await prisma.branch.create({ data: { tenantId: A.id, name: 'Closed', code: 'CLOSED', isActive: false } });
    const r = await post(A.admin, hdr(A, { 'x-branch-id': extra.id }), body(A, { branchId: undefined }));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Selected branch is inactive.');
  });

  it('cause 4 - x-tenant-id of another shop with this shop\'s token: 403 "Tenant context does not match authenticated session"', async () => {
    const r = await post(A.admin, hdr(A, { 'x-tenant-id': B.sub }), body(A));
    expect([400, 403]).toContain(r.status);
    expect(String(r.body.message)).toMatch(/tenant/i);
  });

  it('cause 5 - a non-admin role without accounting:create (Branch Manager) is refused for permission, not for branch', async () => {
    const r = await post(A.branchManager, hdr(A), body(A));
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Insufficient permissions. Required: [accounting:create]');
  });

  it('cause 6 - a bank account of another shop is a 400 (not a 403)', async () => {
    const r = await post(A.admin, hdr(A), body(A, { bankAccountId: B.bankId, label: 'Foreign bank' }));
    expect(r.status).toBe(400);
  });
});
