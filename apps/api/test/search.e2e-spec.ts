/**
 * Search audit (6 Nov 2026): every list search endpoint + the header global search, over HTTP on the
 * full AppModule (bootstrapped like main.ts) against PostgreSQL. Two synthetic shops; shop B holds
 * look-alike "Zebra" records that must never appear for shop A.
 * Needs DATABASE_URL and Redis (REDIS_HOST / REDIS_PORT / REDIS_PASSWORD).
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

jest.setTimeout(300_000);

type Shop = { id: string; sub: string; admin: string; cashier: string };
const ALL_PERMS = ['products:read', 'customers:read', 'suppliers:read', 'sales:read', 'inventory:read', 'hr:read', 'users:read', 'accounting:read'];

describe('Search: list endpoints and global search (tenant-safe)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Search-${Date.now()}-pw!`;
  let passwordHash = '';
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;

  const list = (body: any): any[] => (Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.data) ? body.data.data : []);
  // The full app has the real throttler (10/s, 50/10s, 200/min per IP): pace requests instead of weakening it.
  const pace = () => new Promise((r) => setTimeout(r, 320));
  const get = async (s: Shop, token: string, url: string) => {
    await pace();
    return request(app.getHttpServer()).get(`/api/v1${url}`).set({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost' });
  };

  async function perm(key: string) {
    const [resource, action] = key.split(':');
    return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `srch${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `Search ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const perms = await Promise.all(ALL_PERMS.map(perm));
    const cashierPerms = await Promise.all(['products:read', 'sales:read'].map(perm));
    const adminRole = await prisma.role.create({ data: { tenantId: t.id, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    const cashierRole = await prisma.role.create({ data: { tenantId: t.id, name: 'Cashier', type: RoleType.CASHIER, permissions: { create: cashierPerms.map((p) => ({ permissionId: p.id })) } } });
    const mkUser = (who: string, roleId: string, first: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@srch${label}.test`, passwordHash, firstName: first, lastName: label.toUpperCase(), status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    const admin = await mkUser('admin', adminRole.id, 'Owner');
    const cashier = await mkUser('cashier', cashierRole.id, 'Till');
    // Real login (the full AppModule verifies tokens with its own configured JWT module).
    const sign = async (u: { email: string }) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: u.email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${u.email}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      return r.body.data.accessToken as string;
    };

    const zebra = label === 'a' ? 'Zebra Mango Nectar 1L' : 'Zebra Secret B Cola';
    const cat = await prisma.category.create({ data: { tenantId: t.id, name: label === 'a' ? 'Zebra Snacks' : 'Zebra B Secret Category', slug: `zebra-${label}-${run}` } });
    const products = [{ name: zebra, sku: `ZB-${label}-${run}`, barcode: `4790${label === 'a' ? '1' : '2'}${run}`.slice(0, 13), categoryId: cat.id },
      ...Array.from({ length: label === 'a' ? 25 : 0 }, (_, i) => ({ name: `Audit Product ${i}`, sku: `AUD-${label}-${i}-${run}`, barcode: null as string | null, categoryId: null as string | null }))];
    for (const p of products) {
      const prod = await prisma.product.create({
        data: { tenantId: t.id, name: p.name, slug: `${p.sku}`.toLowerCase(), sku: p.sku, barcode: p.barcode, categoryId: p.categoryId, sellingPrice: 100, costPrice: 80, mrp: 110, status: 'ACTIVE',
          variants: { create: { sku: `${p.sku}-V`, name: 'Default', sellingPrice: 100, costPrice: 80, mrp: 110 } } },
        include: { variants: true },
      });
      await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: prod.variants[0].id, quantity: p.name === zebra ? 2 : 50, reorderPoint: 5 } });
    }
    await prisma.customer.create({ data: { tenantId: t.id, firstName: label === 'a' ? 'Zelda' : 'Zebra', lastName: label === 'a' ? 'Zebrafield' : 'B Secret', phone: label === 'a' ? '0711111111' : '0719999999', email: label === 'a' ? 'zelda@zebra.test' : 'secret@zebra-b.test' } });
    await prisma.customer.create({ data: { tenantId: t.id, firstName: 'Fifty', lastName: 'Percent', phone: '0770000050', email: '50pct@shop.test' } });
    await prisma.supplier.create({ data: { tenantId: t.id, name: label === 'a' ? 'Zebra Distributors' : 'Zebra B Secret Supplier', phone: '0712222222' } });
    await prisma.employee.create({ data: { tenantId: t.id, branchId: branch.id, firstName: label === 'a' ? 'Zara' : 'Zebra', lastName: label === 'a' ? 'Zebrowski' : 'B Secret', phone: '0713333333', joiningDate: new Date(), basicSalary: 1 } });
    await prisma.expense.create({ data: { tenantId: t.id, branchId: branch.id, amount: 10, description: label === 'a' ? 'Zebra electricity bill' : 'Zebra B Secret expense', date: new Date(), categoryId: 'Utilities' } });
    await prisma.expense.create({ data: { tenantId: t.id, branchId: branch.id, amount: 10, description: 'Rent', date: new Date(), categoryId: 'Rent' } });
    await prisma.journalEntry.create({ data: { tenantId: t.id, entryNumber: `JE-${label}-${run}`, description: label === 'a' ? 'Zebra accrual adjustment' : 'Zebra B Secret journal', date: new Date(), status: 'DRAFT' } as never });
    await prisma.sale.create({ data: { tenantId: t.id, branchId: branch.id, invoiceNumber: `INV-${label.toUpperCase()}-${run}`, subtotal: 100, total: 100, status: 'COMPLETED' } });
    // Audit trail: "zebraXprice_list" is a decoy that "zebra_price" would match if "_" were a wildcard.
    await prisma.auditLog.create({ data: { tenantId: t.id, userId: admin.id, action: 'UPDATE', resource: label === 'a' ? 'zebra_price_list' : 'zebra_b_secret', resourceId: `res-${label}-${run}`, ipAddress: label === 'a' ? '10.1.1.1' : '10.2.2.2' } });
    if (label === 'a') await prisma.auditLog.create({ data: { tenantId: t.id, userId: cashier.id, action: 'UPDATE', resource: 'zebraXprice_list', resourceId: `decoy-${run}`, ipAddress: '10.1.1.9' } });
    return { id: t.id, sub, admin: await sign(admin), cashier: await sign(cashier) };
  }

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
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });

  afterAll(async () => { await app?.close(); });

  const LEAK = /Secret B|zebra-b|B Secret|ZB-b-/i;

  describe.each([
    ['/products', 'search', 'Zebra Mango Nectar', 'name'],
    ['/customers', 'search', 'Zebrafield', 'lastName'],
    ['/suppliers', 'search', 'Zebra Distributors', 'name'],
    ['/accounting/expenses', 'search', 'Zebra electricity bill', 'description'],
    ['/accounting/journal-entries', 'q', 'Zebra accrual adjustment', 'description'],
  ])('%s', (url, param, expected, field) => {
    const find = async (term: string) => {
      const r = await get(A, A.admin, `${url}?${param}=${encodeURIComponent(term)}&limit=100`);
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(LEAK);
      return list(r.body);
    };
    it('finds the record: exact, lowercase, uppercase, partial, padded with spaces', async () => {
      for (const term of ['zebra', 'ZEBRA', 'ebr', '  zebra  ', expected.toUpperCase()]) {
        const rows = await find(term);
        expect(rows.map((x) => x[field]).join('|')).toContain(expected);
      }
    });
    it('% and _ are literal (no wildcard: nothing contains them)', async () => {
      expect(await find('%')).toHaveLength(0);
      expect(await find('_')).toHaveLength(0);
    });
    it('a nonsense search returns an empty list (not an error)', async () => {
      expect(await find('qqzzxj9')).toHaveLength(0);
    });
    it("never returns shop B's records, even for B's own words", async () => {
      expect(await find('secret')).toHaveLength(0);
    });
  });

  it('customers: multi-word full name and phone', async () => {
    const r1 = list((await get(A, A.admin, '/customers?search=zelda%20zebrafield')).body);
    expect(r1.map((c) => c.lastName)).toEqual(['Zebrafield']);
    const r2 = list((await get(A, A.admin, '/customers?search=0711111111')).body);
    expect(r2).toHaveLength(1);
  });

  it('customers: "50%" matches the literal text only', async () => {
    const r = list((await get(A, A.admin, '/customers?search=50%25')).body);
    expect(r).toHaveLength(0); // "50pct" is not "50%"
  });

  it('employees and users search; shop B never visible', async () => {
    const e = await get(A, A.admin, '/hr/employees?search=zebrowski');
    expect(list(e.body).map((x) => x.lastName)).toEqual(['Zebrowski']);
    const u = await get(A, A.admin, '/users?search=till');
    expect(list(u.body).map((x) => x.firstName)).toEqual(['Till']);
    expect(JSON.stringify(u.body)).not.toMatch(/@srchb/);
  });

  it('inventory (F-18): finds stock by product name, category and barcode', async () => {
    for (const term of ['zebra mango', 'Zebra Snacks', 'nectar']) {
      const r = await get(A, A.admin, `/inventory?search=${encodeURIComponent(term)}&limit=100`);
      expect(r.status).toBe(200);
      const rows = list(r.body);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(rows)).toContain('Zebra Mango Nectar');
      expect(JSON.stringify(r.body)).not.toMatch(LEAK);
    }
  });

  it('inventory (F-21): lowStock=true returns only items at or below their reorder point', async () => {
    const r = await get(A, A.admin, '/inventory?lowStock=true&limit=100');
    expect(r.status).toBe(200);
    const rows = list(r.body);
    expect(rows.length).toBe(1);
    expect(rows[0].quantity).toBeLessThanOrEqual(5);
  });

  it('sales search by invoice number stays inside the shop', async () => {
    const own = list((await get(A, A.admin, `/sales?search=INV-A-${run}`)).body);
    expect(own).toHaveLength(1);
    const other = list((await get(A, A.admin, `/sales?search=INV-B-${run}`)).body);
    expect(other).toHaveLength(0);
  });

  describe('audit trail GET /audit-logs', () => {
    const audit = async (qs: string) => {
      const r = await get(A, A.admin, `/audit-logs?${qs}&limit=100`);
      expect(r.status).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(/res-b-|10\.2\.2\.2|zebra_b_secret/);
      return list(r.body);
    };

    it('searches by resource id, IP and the user who made the change (name or email)', async () => {
      expect((await audit(`search=res-a-${run}`)).map((x) => x.resourceId)).toEqual([`res-a-${run}`]);
      expect((await audit('search=10.1.1.1')).map((x) => x.ipAddress)).toEqual(['10.1.1.1']);
      const byName = await audit('search=till');
      expect(byName.length).toBeGreaterThanOrEqual(1);
      expect(byName.every((x) => x.user?.firstName === 'Till')).toBe(true);
      const byEmail = await audit(`search=${encodeURIComponent(`admin-${run}@srcha`)}`);
      expect(byEmail.length).toBeGreaterThanOrEqual(1);
      expect(byEmail.every((x) => x.user?.email === `admin-${run}@srcha.test`)).toBe(true);
    });

    it('% and _ are literal in search and in the resource filter; padding is trimmed', async () => {
      expect(await audit('search=%25')).toHaveLength(0);
      expect((await audit('resource=zebra_price')).map((x) => x.resource)).toEqual(['zebra_price_list']);
      expect((await audit(`search=${encodeURIComponent(`  res-a-${run}  `)}`)).map((x) => x.resourceId)).toEqual([`res-a-${run}`]);
    });

    it("never returns shop B's entries, even for B's own IP or resource", async () => {
      expect(await audit('search=10.2.2.2')).toHaveLength(0);
      expect(await audit('resource=zebra_b_secret')).toHaveLength(0);
    });
  });

  it('journal entries: q, status and date filters are accepted (were 400)', async () => {
    for (const qs of ['q=zebra', 'status=DRAFT', 'startDate=2020-01-01&endDate=2100-01-01', 'q=zebra&status=DRAFT&limit=50']) {
      const r = await get(A, A.admin, `/accounting/journal-entries?${qs}`);
      expect(r.status).toBe(200);
    }
    expect((await get(A, A.admin, '/accounting/journal-entries?status=NOPE')).status).toBe(400);
  });

  describe('global search GET /search', () => {
    const search = (s: Shop, token: string, q: string) => get(s, token, `/search?q=${encodeURIComponent(q)}`);
    const groups = (r: request.Response) => Object.fromEntries(((r.body?.data?.groups ?? []) as any[]).map((g) => [g.type, g.items]));

    it('returns grouped results from the own shop only', async () => {
      const r = await search(A, A.admin, 'zebra');
      expect(r.status).toBe(200);
      const g = groups(r);
      expect(g.products.map((x: any) => x.title)).toContain('Zebra Mango Nectar 1L');
      expect(g.customers.map((x: any) => x.title)).toContain('Zelda Zebrafield');
      expect(g.suppliers.map((x: any) => x.title)).toContain('Zebra Distributors');
      expect(JSON.stringify(r.body)).not.toMatch(LEAK);
      expect(g.products[0].href).toMatch(/^\/products\//);
    });

    it('finds invoices by number', async () => {
      const g = groups(await search(A, A.admin, `INV-A-${run}`));
      expect(g.sales.map((x: any) => x.title)).toEqual([`INV-A-${run}`]);
    });

    it('respects permissions: a cashier with only products/sales read gets only those groups', async () => {
      const g = groups(await search(A, A.cashier, 'zebra'));
      expect(Object.keys(g).sort()).toEqual(['products']);
      const g2 = groups(await search(A, A.cashier, '0711111111'));
      expect(g2.customers).toBeUndefined();
    });

    it("shop B's token never sees shop A's data (and vice versa)", async () => {
      const r = await search(B, B.admin, 'zebra');
      expect(JSON.stringify(r.body)).not.toContain('Zelda');
      expect(JSON.stringify(r.body)).not.toContain('Mango');
      expect(JSON.stringify(r.body)).toContain('Secret B Cola');
    });

    it('a token for shop A with shop B in the header is refused', async () => {
      await pace();
      const r = await request(app.getHttpServer()).get('/api/v1/search?q=zebra').set({ Authorization: `Bearer ${A.admin}`, 'x-tenant-id': B.sub, Host: 'localhost' });
      expect(r.status).toBe(403);
    });

    it('short, blank and wildcard-only queries return no groups; no auth → 401', async () => {
      for (const q of ['z', '   ', '%', '__']) expect(groups(await search(A, A.admin, q))).toEqual({});
      await pace();
      expect((await request(app.getHttpServer()).get('/api/v1/search?q=zebra').set({ 'x-tenant-id': A.sub, Host: 'localhost' })).status).toBe(401);
    });
  });
});
