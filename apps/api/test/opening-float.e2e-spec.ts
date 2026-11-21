/**
 * POST /cash/open opening float validation: malformed / negative / unreasonable amounts are refused, the maximum
 * is configurable per shop (Settings → POS) and per branch, and existing drawer balances carried over by a
 * counter handover are never capped. Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { CashRegisterStatus, RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { DEFAULT_MAX_OPENING_FLOAT } from '../src/shared/opening-float.helper';

jest.setTimeout(300_000);
const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read'];

describe('Opening float validation (POST /cash/open)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `OFV-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let sub = '';
  let tenantId = '';
  let branchId = '';
  let counter1 = '';
  let counter2 = '';
  let admin = '';
  const cashiers: { id: string; token: string }[] = [];

  const pace = () => new Promise((r) => setTimeout(r, 200));
  const hdr = (token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': sub, Host: 'localhost' });
  const post = async (token: string, url: string, body: unknown) => { await pace(); return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(token)).send(body as object); };
  const put = async (token: string, url: string, body: unknown) => { await pace(); return request(app.getHttpServer()).put(`/api/v1${url}`).set(hdr(token)).send(body as object); };
  const get = async (token: string, url: string) => { await pace(); return request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr(token)); };
  const registers = (cashierId: string) => prisma.cashRegister.count({ where: { tenantId, cashierId } });

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

    sub = `ofv${run}`;
    const t = await prisma.tenant.create({ data: { name: 'OFV', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    tenantId = t.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } });
    branchId = branch.id;
    await prisma.warehouse.create({ data: { tenantId, branchId, name: 'Main', code: 'WH-OFV', isDefault: true } });
    counter1 = (await prisma.posCounter.create({ data: { tenantId, branchId, name: 'Counter 1', code: 'C1' } })).id;
    counter2 = (await prisma.posCounter.create({ data: { tenantId, branchId, name: 'Counter 2', code: 'C2' } })).id;
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      const ps = await Promise.all(keys.map((k) => {
        const [resource, action] = k.split(':');
        return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
      }));
      return prisma.role.create({ data: { tenantId, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const adminRole = await role('Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const cashierRole = await role('Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, roleId: string) => prisma.user.create({
      data: { tenantId, branchId, email: `${who}-${run}@ofv.test`, passwordHash: hash, firstName: who, lastName: 'OFV', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    const sign = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    admin = await sign((await mk('admin', adminRole.id)).email);
    for (let i = 1; i <= 6; i++) {
      const u = await mk(`cashier${i}`, cashierRole.id);
      cashiers.push({ id: u.id, token: await sign(u.email) });
    }
  });

  afterAll(async () => { await app?.close(); });

  it('refuses negative, malformed, over-precise and absurd amounts; nothing is written', async () => {
    const c = cashiers[0];
    for (const bad of [-1, 'abc', '12abc', 10.123, 1e12, null]) {
      const r = await post(c.token, '/cash/open', { openingCash: bad });
      expect(r.status).toBe(400);
    }
    const huge = await post(c.token, '/cash/open', { openingCash: 4_111_212_121 });
    expect(huge.status).toBe(400);
    expect(JSON.stringify(huge.body)).toContain(`above the maximum of LKR ${DEFAULT_MAX_OPENING_FLOAT.toLocaleString('en-US')}`);
    expect(await registers(c.id)).toBe(0);
  });

  it('accepts normal floats (0, whole, 2 decimals) up to the default maximum', async () => {
    const ok = await post(cashiers[0].token, '/cash/open', { openingCash: 5000.5 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.openingCash).toBe(5000.5);
    expect((await post(cashiers[1].token, '/cash/open', { openingCash: 0 })).status).toBe(201);
  });

  it('shop maximum (Settings → POS) applies; only an admin can change it; bad settings refused', async () => {
    expect((await put(cashiers[2].token, '/tenants/pos-settings', { maxOpeningFloat: 999_999 })).status).toBe(403);
    for (const bad of [-5, 0, 'abc', 10.555]) {
      expect((await put(admin, '/tenants/pos-settings', { maxOpeningFloat: bad })).status).toBe(400);
    }
    const saved = await put(admin, '/tenants/pos-settings', { maxOpeningFloat: 20_000 });
    expect(saved.status).toBe(200);
    expect(saved.body.data.maxOpeningFloat).toBe(20_000);
    const over = await post(cashiers[2].token, '/cash/open', { openingCash: 25_000 });
    expect(over.status).toBe(400);
    expect(JSON.stringify(over.body)).toContain('above the maximum of LKR 20,000 for this shop');
    expect((await post(cashiers[2].token, '/cash/open', { openingCash: 20_000 })).status).toBe(201);
  });

  it('branch override wins over the shop maximum, and removing it restores the shop maximum', async () => {
    const set = await put(admin, '/tenants/pos-settings/branch-opening-float', { branchId, maxOpeningFloat: 30_000 });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ max: 30_000, source: 'BRANCH' });
    expect((await post(cashiers[3].token, '/cash/open', { openingCash: 30_000.01 })).status).toBe(400);
    expect((await post(cashiers[3].token, '/cash/open', { openingCash: 25_000 })).status).toBe(201);
    const removed = await put(admin, '/tenants/pos-settings/branch-opening-float', { branchId, maxOpeningFloat: null });
    expect(removed.body.data).toMatchObject({ max: 20_000, source: 'SHOP' });
    const sugg = await get(cashiers[4].token, '/cash/opening-suggestion');
    expect(sugg.body.data).toMatchObject({ maxOpeningFloat: 20_000, maxOpeningFloatSource: 'SHOP' });
  });

  it('a counter handover keeps an existing balance above the maximum (legitimate balances are not capped)', async () => {
    // An earlier cashier left LKR 250,000 in Counter 2 (above the 20,000 limit): taking over carries it unchanged.
    const previous = cashiers[0];
    await prisma.cashRegister.create({
      data: { tenantId, branchId, counterId: counter2, cashierId: previous.id, openingCash: 250_000, status: CashRegisterStatus.CLOSED, closingCash: 250_000, closingTime: new Date() },
    });
    const r = await post(cashiers[4].token, '/cash/open', { openingCash: 0, counterId: counter2 });
    expect(r.status).toBe(201);
    const mine = await prisma.cashRegister.findFirstOrThrow({ where: { tenantId, cashierId: cashiers[4].id, counterId: counter2 } });
    expect(mine.openingCash).toBe(250_000);
  });

  it('a drawer above the absolute cap can still be handed over WITH a count (existing balances stay usable)', async () => {
    // Counter 1 holds an existing balance of 150,000,000 (above any opening-float limit and the 100,000,000 sanity cap).
    const holder = cashiers[1];
    const big = 150_000_000;
    await prisma.cashRegister.create({
      data: { tenantId, branchId, counterId: counter1, cashierId: holder.id, openingCash: big, status: CashRegisterStatus.CLOSED, closingCash: big, closingTime: new Date() },
    });
    const next = cashiers[3];
    const counted = await post(next.token, '/cash/open', { openingCash: 0, counterId: counter1, countedCash: big });
    expect(counted.status).toBe(201);
    const mine = await prisma.cashRegister.findFirstOrThrow({ where: { tenantId, cashierId: next.id, counterId: counter1 }, orderBy: { createdAt: 'desc' } });
    expect(mine.openingCash).toBe(big);
    // a count far beyond the recorded balance is still refused as a typing error
    const typo = await post(cashiers[4].token, '/cash/open', { openingCash: 0, counterId: counter1, countedCash: 1e15 });
    expect(typo.status).toBe(400);
  });

  it('never pre-fills a refused figure from an earlier close', async () => {
    const c = cashiers[5];
    await prisma.cashRegister.create({
      data: { tenantId, branchId, counterId: counter1, cashierId: c.id, openingCash: 0, status: CashRegisterStatus.CLOSED, closingCash: 4_111_212_121, actualCash: 4_111_212_121, closingTime: new Date(), clearedAt: new Date(), clearedAmount: 4_111_212_121 },
    });
    const s = await get(c.token, `/cash/opening-suggestion?counterId=${counter1}`);
    expect(s.status).toBe(200);
    expect(s.body.data.suggestedOpening).toBeNull();
    expect(s.body.data.maxOpeningFloat).toBe(20_000);
  });
});
