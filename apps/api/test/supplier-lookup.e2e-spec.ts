/**
 * GET /suppliers/lookup — lightweight supplier search for the POS Quick GRN picker.
 * Minimum 2 characters, id / name / phone / code only, tenant-scoped, suppliers:read, no balance recalculation and
 * no database writes, fast on a large shop. Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
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

jest.setTimeout(400_000);

type Shop = { id: string; sub: string; admin: string; noRead: string; staleSupplierId: string; variantId: string };
const LARGE = 3000;

describe('Supplier lookup (POS Quick GRN picker)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Lkp-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = (token: string, sub: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': sub, Host: 'localhost' });
  const lookup = async (token: string, sub: string, qs: string) => { await pace(); return request(app.getHttpServer()).get(`/api/v1/suppliers/lookup${qs}`).set(hdr(token, sub)); };

  async function login(sub: string, email: string) {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
    if (r.status !== 200) throw new Error(`login ${r.status}`);
    await pace();
    return r.body.data.accessToken as string;
  }

  async function seed(label: 'a' | 'b', bulk: number): Promise<Shop> {
    const sub = `lkp${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `LKP ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const admin = await prisma.role.create({ data: { tenantId: t.id, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const productsOnly = await prisma.role.create({
      data: { tenantId: t.id, name: 'Products only', type: RoleType.CUSTOM, permissions: { create: ps.filter((p) => p.resource === 'products' && p.action === 'read').map((p) => ({ permissionId: p.id })) } },
    });
    const mk = (email: string, roleId: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email, passwordHash: bcryptHash, firstName: 'U', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    await mk(`admin-${run}@lkp${label}.test`, admin.id);
    await mk(`noread-${run}@lkp${label}.test`, productsOnly.id);
    // named suppliers used by the assertions
    await prisma.supplier.createMany({ data: [
      { tenantId: t.id, name: `Lanka Distributors ${label.toUpperCase()}`, phone: '0771234567', code: `SUP-LANKA-${label.toUpperCase()}` },
      { tenantId: t.id, name: `Ceylon Traders ${label.toUpperCase()}`, phone: '0112000002', code: `SUP-CEY-${label.toUpperCase()}` },
    ] });
    if (bulk) {
      await prisma.supplier.createMany({ data: Array.from({ length: bulk }, (_, i) => ({
        tenantId: t.id, name: `Bulk Supplier ${String(i).padStart(4, '0')}`, phone: `07${String(10000000 + i)}`, code: `SUP-BULK-${i}`,
      })) });
    }
    // a supplier with an open, received purchase order and a deliberately STALE cached balance
    const p = await prisma.product.create({
      data: { tenantId: t.id, name: `Item ${label}`, slug: `item-${label}-${run}`, sku: `LKP-${label}-${run}`, sellingPrice: 100, costPrice: 60, mrp: 120, status: 'ACTIVE',
        variants: { create: { sku: `LKP-${label}-${run}-V`, name: 'Default', sellingPrice: 100, costPrice: 60, mrp: 120 } } },
      include: { variants: true },
    });
    const stale = await prisma.supplier.create({ data: { tenantId: t.id, name: `Stale Balance Supplier ${label.toUpperCase()}`, phone: '0779999999', code: `SUP-STALE-${label.toUpperCase()}` } });
    const token = await login(sub, `admin-${run}@lkp${label}.test`);
    const po = await request(app.getHttpServer()).post('/api/v1/purchases').set(hdr(token, sub)).send({
      supplierId: stale.id, createAndReceive: true, clientRequestId: `lkp-${label}-${run}`,
      items: [{ variantId: p.variants[0].id, productName: 'Item', variantName: 'Default', sku: 'x', orderedQty: 10, unitCost: 50 }],
    });
    if (po.status !== 201) throw new Error(`po ${po.status} ${JSON.stringify(po.body.message)}`);
    await prisma.supplier.update({ where: { id: stale.id }, data: { balance: 999.99 } });  // real outstanding is 500
    return { id: t.id, sub, admin: token, noRead: await login(sub, `noread-${run}@lkp${label}.test`), staleSupplierId: stale.id, variantId: p.variants[0].id };
  }
  let bcryptHash = '';

  /** Row version of every supplier of a shop: xmin changes on ANY update, even one writing the same values. */
  const rowVersions = async (tenantId: string) =>
    (await prisma.$queryRaw<{ id: string; v: string; balance: number }[]>`SELECT id, xmin::text AS v, balance FROM suppliers WHERE "tenantId" = ${tenantId} ORDER BY id`)
      .map((r) => `${r.id}:${r.v}:${r.balance}`).join('|');

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
    bcryptHash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a', LARGE);
    B = await seed('b', 0);
  });

  afterAll(async () => {
    await new Promise((res) => setTimeout(res, 1000));
    await app?.close();
  });

  it('one non-blank character returns an empty list (no search)', async () => {
    for (const q of ['l', ' l ', '7', '']) {
      const r = await lookup(A.admin, A.sub, `?search=${encodeURIComponent(q)}`);
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual([]);
    }
    expect((await lookup(A.admin, A.sub, '')).body.data).toEqual([]);
  });

  it('two characters work: name, phone and code, case-insensitive, partial', async () => {
    const names = async (q: string) => ((await lookup(A.admin, A.sub, `?search=${encodeURIComponent(q)}&limit=50`)).body.data as { name: string }[]).map((s) => s.name);
    expect(await names('la')).toEqual(expect.arrayContaining(['Lanka Distributors A', 'Stale Balance Supplier A']));
    expect(await names('LANKA dist')).toEqual(['Lanka Distributors A']);
    expect(await names('0771234')).toEqual(['Lanka Distributors A']);
    expect(await names('sup-cey')).toEqual(['Ceylon Traders A']);
    expect(await names('zz-nothing')).toEqual([]);
  });

  it('returns only id, name, phone and code — no balance, no relations', async () => {
    const r = await lookup(A.admin, A.sub, '?search=stale');
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(Object.keys(r.body.data[0]).sort()).toEqual(['code', 'id', 'name', 'phone']);
    expect(r.body.data[0]).toEqual({ id: A.staleSupplierId, name: 'Stale Balance Supplier A', phone: '0779999999', code: 'SUP-STALE-A' });
  });

  it('limit: search default 20 and at most 50 rows; values above 100 or below 1 refused', async () => {
    expect((await lookup(A.admin, A.sub, '?search=bulk')).body.data).toHaveLength(20);
    expect((await lookup(A.admin, A.sub, '?search=bulk&limit=50')).body.data).toHaveLength(50);
    expect((await lookup(A.admin, A.sub, '?search=bulk&limit=80')).body.data).toHaveLength(50);  // search capped at 50
    expect((await lookup(A.admin, A.sub, '?search=bulk&limit=101')).status).toBe(400);
    expect((await lookup(A.admin, A.sub, '?search=bulk&limit=0')).status).toBe(400);
    expect((await lookup(A.admin, A.sub, `?search=${'x'.repeat(101)}`)).status).toBe(400);
  });

  it('browse (initial load / Refresh): first 100 by name + the shop total, four fields only', async () => {
    const r = await lookup(A.admin, A.sub, '?browse=true&limit=100');
    expect(r.status).toBe(200);
    const { data, meta } = r.body.data as { data: { id: string; name: string }[]; meta: { total: number; hasNextPage: boolean } };
    expect(data).toHaveLength(100);
    expect(meta.total).toBe(LARGE + 3);
    expect(meta.hasNextPage).toBe(true);
    const names = data.map((s) => s.name);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }) || 0));
    expect(names[0]).toBe('Bulk Supplier 0000');                                         // alphabetical first page
    for (const row of data) expect(Object.keys(row).sort()).toEqual(['code', 'id', 'name', 'phone']);
    // default limit 100; browse ignores any search text; small shop gets everything and no next page
    expect(((await lookup(A.admin, A.sub, '?browse=true')).body.data.data as unknown[]).length).toBe(100);
    expect(((await lookup(A.admin, A.sub, '?browse=true&search=lanka')).body.data.data as unknown[]).length).toBe(100);
    const small = (await lookup(B.admin, B.sub, '?browse=true&limit=100')).body.data;
    expect(small.meta).toMatchObject({ total: 3, hasNextPage: false });
    expect((small.data as { name: string }[]).map((s) => s.name)).toEqual(['Ceylon Traders B', 'Lanka Distributors B', 'Stale Balance Supplier B']);
    expect((await lookup(A.admin, A.sub, '?browse=true&limit=101')).status).toBe(400);
    expect((await lookup(A.admin, A.sub, '?browse=false&search=lanka')).body.data).toEqual([expect.objectContaining({ name: 'Lanka Distributors A' })]);
  });

  it('browse: shop isolation and suppliers:read authorization', async () => {
    const b = (await lookup(B.admin, B.sub, '?browse=true')).body.data.data as { name: string }[];
    expect(b.every((s) => s.name.endsWith(' B'))).toBe(true);                               // none of A's 3,003
    expect((await lookup(B.admin, A.sub, '?browse=true')).status).toBe(403);
    expect((await lookup(A.noRead, A.sub, '?browse=true')).status).toBe(403);
    await pace();
    const anon = await request(app.getHttpServer()).get('/api/v1/suppliers/lookup?browse=true').set({ 'x-tenant-id': A.sub, Host: 'localhost' });
    expect(anon.status).toBe(401);
  });

  it('browse: no balance recalculation and no database writes', async () => {
    await prisma.supplier.update({ where: { id: B.staleSupplierId }, data: { balance: 777.77 } });   // stale on purpose
    const beforeA = await rowVersions(A.id);
    const beforeB = await rowVersions(B.id);
    for (let i = 0; i < 4; i++) {
      expect((await lookup(A.admin, A.sub, '?browse=true&limit=100')).status).toBe(200);
      expect((await lookup(B.admin, B.sub, '?browse=true&limit=100')).status).toBe(200);
    }
    expect(await rowVersions(A.id)).toBe(beforeA);
    expect(await rowVersions(B.id)).toBe(beforeB);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: B.staleSupplierId } })).balance).toBe(777.77);
  });

  it('shop isolation: each shop only ever sees its own suppliers', async () => {
    const a = (await lookup(A.admin, A.sub, '?search=lanka')).body.data as { name: string }[];
    const b = (await lookup(B.admin, B.sub, '?search=lanka')).body.data as { name: string }[];
    expect(a.map((s) => s.name)).toEqual(['Lanka Distributors A']);
    expect(b.map((s) => s.name)).toEqual(['Lanka Distributors B']);
    expect((await lookup(B.admin, B.sub, '?search=bulk')).body.data).toEqual([]);           // A's 3,000 suppliers invisible to B
    expect((await lookup(B.admin, B.sub, `?search=SUP-STALE-A`)).body.data).toEqual([]);
    expect((await lookup(B.admin, A.sub, '?search=lanka')).status).toBe(403);               // B's token with A's shop header
  });

  it('authorization: suppliers:read required; anonymous refused', async () => {
    expect((await lookup(A.noRead, A.sub, '?search=lanka')).status).toBe(403);
    await pace();
    const anon = await request(app.getHttpServer()).get('/api/v1/suppliers/lookup?search=lanka').set({ 'x-tenant-id': A.sub, Host: 'localhost' });
    expect(anon.status).toBe(401);
  });

  it('no balance recalculation and no database writes (contrast: GET /suppliers rewrites the stale balance)', async () => {
    const before = await rowVersions(A.id);
    for (const q of ['stale', 'la', 'bulk', 'sup-', '077', 'ceylon']) {
      expect((await lookup(A.admin, A.sub, `?search=${q}&limit=50`)).status).toBe(200);
    }
    expect(await rowVersions(A.id)).toBe(before);                                            // no row touched at all
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: A.staleSupplierId } })).balance).toBe(999.99);

    // the full list endpoint (used for the 100-supplier preload) still behaves as before: it resyncs the cache
    await pace();
    const legacy = await request(app.getHttpServer()).get('/api/v1/suppliers?search=stale&limit=50').set(hdr(A.admin, A.sub));
    expect(legacy.status).toBe(200);
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: A.staleSupplierId } })).balance).toBe(500);
  });

  it(`large shop (${LARGE + 3} suppliers): lookup stays fast and bounded`, async () => {
    const timed = async (url: string) => {
      await pace();                                   // throttle spacing, outside the timed window
      const t0 = Date.now();
      const r = await request(app.getHttpServer()).get(url).set(hdr(A.admin, A.sub));
      return { r, ms: Date.now() - t0 };
    };
    const times: number[] = [];
    for (const q of ['bulk supplier 29', 'sup-bulk-1', '0710000', 'bulk 0', 'lanka']) {
      const { r, ms } = await timed(`/api/v1/suppliers/lookup?search=${encodeURIComponent(q)}&limit=50`);
      expect(r.status).toBe(200);
      expect(r.body.data.length).toBeLessThanOrEqual(50);
      times.push(ms);
    }
    const legacy = await timed('/api/v1/suppliers?search=bulk&limit=50');
    // eslint-disable-next-line no-console
    console.log(`lookup ms (5 queries): ${times.join(', ')} | legacy GET /suppliers?search=bulk&limit=50: ${legacy.ms} ms`);
    expect(Math.max(...times)).toBeLessThan(1000);
  });
});
