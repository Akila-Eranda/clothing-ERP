/**
 * POS security wave 1 — audit findings P-F1, P-F2 (cap only), P-F9, P-F10, P-F18 over HTTP on the full
 * AppModule against PostgreSQL + Redis.
 *
 * DRAFT — WRITTEN BUT NOT RUN: needs DATABASE_URL (an empty TEST database with the schema applied) and
 * REDIS_HOST / REDIS_PORT / REDIS_PASSWORD, like pos-payments-cashout / stock-idempotency-mrp. Never point it at
 * production.  Run: pnpm --filter ./apps/api test:e2e -- pos-security-wave1
 *
 * Actors: the REAL default Cashier / Branch Manager / Tenant Admin roles (ensureSystemRoles), a second
 * default Cashier, and a user whose custom role has no sales permission.
 * Unauthorized findings (scale barcode mode, weighed-goods guard, MRP cap, overpayment, returns, fractional
 * qty, discount approval threshold) are deliberately NOT covered here — they are open policy decisions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { ProductKind, RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { ensureSystemRoles } from '../src/modules/roles/default-system-roles';

jest.setTimeout(300_000);

type Product = { variantId: string; name: string };
type Shop = {
  id: string; sub: string; branchId: string; branch2Id: string; counterId: string;
  milk: Product; // piece good: selling 200, cost 150, MRP 220
  cashier: string; cashier2: string; cashier3: string; manager: string; admin: string; noSales: string;
};

describe('POS security wave 1 (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const PASSWORD = `PSW1-${Date.now()}-pw!`;
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string) =>
    ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', 'x-pos-counter-id': s.counterId });
  const call = async (
    method: 'get' | 'post' | 'delete',
    s: Shop,
    token: string,
    url: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set({ ...hdr(s, token), ...extraHeaders });
    return body === undefined ? r : r.send(body as object);
  };
  const line = (p: Product, quantity: number, unitPrice: number, extra: object = {}) =>
    ({ variantId: p.variantId, productName: p.name, variantName: 'Default', sku: 'SKU', quantity, unitPrice, costPrice: 1, ...extra });
  const sale = (s: Shop, token: string, items: object[], payments: object[] = [{ method: 'CASH', amount: 100_000 }], extra: object = {}) =>
    call('post', s, token, '/pos/sale', { items, payments, applyTierDiscount: false, ...extra });
  const hold = (s: Shop, token: string, data: object = { items: [{ variantId: s.milk.variantId, quantity: 1 }] }) =>
    call('post', s, token, '/pos/hold', { label: 'IT', data });
  const saleCount = (s: Shop) => prisma.sale.count({ where: { tenantId: s.id } });
  const onHand = async (s: Shop, variantId: string) =>
    (await prisma.inventory.aggregate({ where: { tenantId: s.id, variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const reserved = async (s: Shop, heldBillId: string) =>
    prisma.inventoryReservation.count({ where: { tenantId: s.id, sourceType: 'HELD_BILL', sourceId: heldBillId, status: 'ACTIVE' } });

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `psw${label}${run}`;
    const t = await prisma.tenant.create({
      data: { name: `PSW ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE',
        settings: { pos: { allowNegativeStock: false } } },
    });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const branch2 = await prisma.branch.create({ data: { tenantId: t.id, name: 'Second', code: 'SEC' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const wh2 = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch2.id, name: 'Second', code: `WH2-${label}`, isDefault: false } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });

    await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    await ensureSystemRoles(prisma, t.id); // the real default Cashier / Branch Manager / Tenant Admin
    const roleId = async (name: string) => (await prisma.role.findFirstOrThrow({ where: { tenantId: t.id, name } })).id;
    const reportsOnly = await prisma.role.create({
      data: { tenantId: t.id, name: 'Reports only', type: RoleType.CUSTOM,
        permissions: { create: [{ permission: { connect: { resource_action: { resource: 'reports', action: 'read' } } } }] } },
    });
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, rid: string, branchId = branch.id) => prisma.user.create({
      data: { tenantId: t.id, branchId, email: `${who}-${run}@psw${label}.test`, passwordHash: hash,
        firstName: who, lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: rid } } },
    });
    const cashierRole = await roleId('Cashier');
    const users = {
      cashier: await mk('cashier', cashierRole),
      cashier2: await mk('cashier2', cashierRole),
      cashier3: await mk('cashier3', cashierRole, branch2.id), // same shop, other branch
      manager: await mk('manager', await roleId('Branch Manager')),
      admin: await mk('admin', await roleId('Tenant Admin')),
      noSales: await mk('nosales', reportsOnly.id),
    };
    const login = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const p = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Milk ${label}`, slug: `milk-${label}-${run}`, sku: `MILK-${label}-${run}-P`, status: 'ACTIVE',
        sellingPrice: 200, costPrice: 150, mrp: 220, unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: false,
        variants: { create: { sku: `MILK-${label}-${run}`, name: 'Default', sellingPrice: 200, costPrice: 150, mrp: 220 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: p.variants[0].id, quantity: 500, damagedQty: 0, returnedQty: 0 } });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch2.id, warehouseId: wh2.id, variantId: p.variants[0].id, quantity: 100, damagedQty: 0, returnedQty: 0 } });
    return {
      id: t.id, sub, branchId: branch.id, branch2Id: branch2.id, counterId: counter.id,
      milk: { variantId: p.variants[0].id, name: p.name },
      cashier: await login(users.cashier.email), cashier2: await login(users.cashier2.email),
      cashier3: await login(users.cashier3.email), manager: await login(users.manager.email),
      admin: await login(users.admin.email), noSales: await login(users.noSales.email),
    };
  }

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = m.get(PrismaService);
    A = await seed('a');
    B = await seed('b');
  });
  afterAll(async () => { await app?.close(); });

  // ── P-F1 ──────────────────────────────────────────────────────────────
  describe('P-F1 reloadType on a catalog line', () => {
    it('a catalog line flagged reloadType=DIGITAL (LKR 1 milk, no operator) is refused 400; nothing written', async () => {
      const before = [await saleCount(A), await onHand(A, A.milk.variantId)];
      const r = await sale(A, A.cashier, [line(A.milk, 1, 1, { reloadType: 'DIGITAL' })]);
      expect(r.status).toBe(400);
      expect([await saleCount(A), await onHand(A, A.milk.variantId)]).toEqual(before);
      expect(await prisma.reloadSale.count({ where: { tenantId: A.id } })).toBe(0);
    });
    it('the same with reloadType=PHYSICAL and an operator id is refused too', async () => {
      const r = await sale(A, A.cashier, [line(A.milk, 1, 1, { reloadType: 'PHYSICAL', reloadOperatorId: 'x', reloadDenominationId: 'y' })]);
      expect(r.status).toBe(400);
    });
    it('a Tenant Admin cannot use it either (it is not a price override)', async () => {
      expect((await sale(A, A.admin, [line(A.milk, 1, 1, { reloadType: 'DIGITAL' })])).status).toBe(400);
    });
    it('CONTROL: the same LKR 1 line without reloadType is refused (below cost)', async () => {
      expect((await sale(A, A.cashier, [line(A.milk, 1, 1)])).status).toBe(400);
    });
  });

  // ── P-F2 (cap only) ───────────────────────────────────────────────────
  describe('P-F2 bill discount cap', () => {
    it('a Cashier cannot apply a direct discount while approval policy is unconfigured; no sale is created', async () => {
      const before = await saleCount(A);
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 0 }], { discountAmount: 100_000 });
      expect(r.status).toBe(403);
      expect(await saleCount(A)).toBe(before);
    });
    it('a Tenant Admin is capped too', async () => {
      expect((await sale(A, A.admin, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 0 }], { discountAmount: 200.01 })).status).toBe(400);
    });
    it('CONTROL: a Tenant Admin may apply an in-range LKR 10 discount', async () => {
      const r = await sale(A, A.admin, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 190 }], { discountAmount: 10 });
      expect(r.status).toBe(201);
      expect(Number(r.body.data.total)).toBe(190);
    });
  });

  // ── P-F9 ──────────────────────────────────────────────────────────────
  describe('P-F9 held-bill / coupon permissions and payload', () => {
    it('a user without any sales permission cannot hold, list or delete held bills or validate coupons (403)', async () => {
      expect((await hold(A, A.noSales)).status).toBe(403);
      expect((await call('get', A, A.noSales, '/pos/hold')).status).toBe(403);
      const own = await hold(A, A.cashier);
      expect(own.status).toBe(201);
      expect((await call('delete', A, A.noSales, `/pos/hold/${own.body.data.id}`)).status).toBe(403);
      expect(await prisma.heldBill.count({ where: { id: own.body.data.id } })).toBe(1);
      expect((await call('get', A, A.noSales, '/pos/coupons/validate/ANY?amount=100')).status).toBe(403);
    });
    it('CONTROL: the default Cashier can hold, list, delete and validate coupons', async () => {
      const h = await hold(A, A.cashier);
      expect(h.status).toBe(201);
      expect((await call('get', A, A.cashier, '/pos/hold')).status).toBe(200);
      expect((await call('delete', A, A.cashier, `/pos/hold/${h.body.data.id}`)).status).toBe(204);
      expect((await call('get', A, A.cashier, '/pos/coupons/validate/ANY?amount=100')).status).toBe(200);
    });
    it('CONTROL: the web cart payload (customer, discount, notes, decimal and custom lines) is accepted', async () => {
      const r = await hold(A, A.cashier, {
        items: [
          { variantId: A.milk.variantId, productName: 'Milk', quantity: 2, unitPrice: 200, discountAmount: 0, discountType: 'fixed' },
          { variantId: 'custom-x1', productName: 'Bag', quantity: 1, unitPrice: 10, isCustom: true },
        ],
        customer: null, discount: 5, discountType: 'percentage', taxRate: 0, notes: '', couponCode: null, loyaltyPointsToRedeem: 0,
      });
      expect(r.status).toBe(201);
    });
    it.each([
      ['quantity 0', { items: [{ variantId: 'v', quantity: 0 }] }],
      ['negative quantity', { items: [{ variantId: 'v', quantity: -400 }] }],
      ['string quantity', { items: [{ variantId: 'v', quantity: '2' }] }],
      ['items not an array', { items: 'x' }],
    ])('a hold with %s is refused 400 and reserves nothing', async (_n, data) => {
      const before = await prisma.inventoryReservation.count({ where: { tenantId: A.id } });
      expect((await hold(A, A.cashier, data)).status).toBe(400);
      expect(await prisma.inventoryReservation.count({ where: { tenantId: A.id } })).toBe(before);
    });
  });

  // ── P-F10 ─────────────────────────────────────────────────────────────
  describe('P-F10 sale resumes / deletes a held bill only within its scope', () => {
    it("a sale in shop A naming shop B's heldBillId is refused 404; B's hold and reservation survive; no sale", async () => {
      const heldB = await hold(B, B.cashier);
      expect(heldB.status).toBe(201);
      const before = await saleCount(A);
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: heldB.body.data.id });
      expect(r.status).toBe(404);
      expect(await saleCount(A)).toBe(before);
      expect(await prisma.heldBill.count({ where: { id: heldB.body.data.id, tenantId: B.id } })).toBe(1);
      expect(await reserved(B, heldB.body.data.id)).toBeGreaterThan(0);
    });
    it("a Cashier cannot consume another cashier's hold in the same branch (404, hold + reservation kept)", async () => {
      const other = await hold(A, A.cashier2);
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: other.body.data.id });
      expect(r.status).toBe(404);
      expect(await prisma.heldBill.count({ where: { id: other.body.data.id } })).toBe(1);
      expect(await reserved(A, other.body.data.id)).toBeGreaterThan(0);
    });
    it('a hold of another branch of the same shop cannot be consumed (404)', async () => {
      const otherBranch = await prisma.heldBill.create({
        data: { tenantId: A.id, branchId: A.branch2Id, cashierId: (await prisma.user.findFirstOrThrow({ where: { tenantId: A.id, firstName: 'cashier3' } })).id, label: 'B2', data: { items: [] } },
      });
      const r = await sale(A, A.admin, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: otherBranch.id });
      expect(r.status).toBe(404);
      expect(await prisma.heldBill.count({ where: { id: otherBranch.id } })).toBe(1);
    });
    it('an unknown heldBillId is refused 404 before any write', async () => {
      const before = [await saleCount(A), await onHand(A, A.milk.variantId)];
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: 'does-not-exist' });
      expect(r.status).toBe(404);
      expect([await saleCount(A), await onHand(A, A.milk.variantId)]).toEqual(before);
    });
    it('CONTROL: a Cashier checks out their own hold: sale 201, hold deleted, reservation consumed', async () => {
      const own = await hold(A, A.cashier);
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: own.body.data.id });
      expect(r.status).toBe(201);
      expect(await prisma.heldBill.count({ where: { id: own.body.data.id } })).toBe(0);
      expect(await reserved(A, own.body.data.id)).toBe(0);
    });
    it("CONTROL: a Tenant Admin may check out a cashier's hold of the branch (same scope as GET /pos/hold)", async () => {
      const h = await hold(A, A.cashier2);
      const r = await sale(A, A.admin, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { heldBillId: h.body.data.id });
      expect(r.status).toBe(201);
      expect(await prisma.heldBill.count({ where: { id: h.body.data.id } })).toBe(0);
    });
  });

  // ── P-F18 ─────────────────────────────────────────────────────────────
  describe('P-F18 customer ledger descriptions', () => {
    it('wallet and loyalty rows carry the real invoice number, never "null"', async () => {
      const c = await prisma.customer.create({ data: { tenantId: A.id, firstName: 'Ruwan', phone: `071${run.slice(-7)}`, walletBalance: 1000 } });
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'WALLET', amount: 200 }], { customerId: c.id });
      expect(r.status).toBe(201);
      const inv = r.body.data.invoiceNumber as string;
      expect(inv).toBeTruthy();
      const wallet = await prisma.walletTransaction.findMany({ where: { tenantId: A.id, referenceId: r.body.data.id } });
      const loyalty = await prisma.loyaltyTransaction.findMany({ where: { tenantId: A.id, referenceId: r.body.data.id } });
      for (const row of [...wallet, ...loyalty]) {
        expect(row.description).toContain(inv);
        expect(row.description).not.toContain('null');
      }
      expect(wallet.length).toBe(1);
    });
  });

  describe('assigned branch request scope', () => {
    it('keeps omitted and empty report branch selectors scoped to the assigned branch', async () => {
      const noSelector = await call('get', A, A.manager, '/reports/inventory');
      const emptySelector = await call('get', A, A.manager, '/reports/inventory?branchId=');

      expect(noSelector.status).toBe(200);
      expect(emptySelector.status).toBe(200);
      expect(noSelector.body.data.rows.map((row: { branchId: string }) => row.branchId)).toEqual([A.branchId]);
      expect(emptySelector.body.data.rows.map((row: { branchId: string }) => row.branchId)).toEqual([A.branchId]);
    });

    it('rejects a forged x-branch-id header for an assigned Branch Manager', async () => {
      const response = await call('get', A, A.manager, '/pos/summary', undefined, { 'x-branch-id': A.branch2Id });
      expect(response.status).toBe(403);
    });

    it('rejects a forged branchId query for an assigned Branch Manager', async () => {
      const response = await call(
        'get',
        A,
        A.manager,
        `/reports/sales?startDate=2026-01-01&endDate=2026-01-31&branchId=${A.branch2Id}`,
      );
      expect(response.status).toBe(403);
    });

    it('rejects a forged sourceBranchId in the request body', async () => {
      const response = await call('post', A, A.manager, '/inventory/transfers', {
        fromBranchId: A.branch2Id,
        toBranchId: A.branchId,
        items: [],
      });
      expect(response.status).toBe(403);
    });

    it('rejects cross-tenant branch selection for Tenant Admin query and body inputs', async () => {
      const query = await call(
        'get',
        A,
        A.admin,
        `/reports/sales?startDate=2026-01-01&endDate=2026-01-31&branchId=${B.branchId}`,
      );
      expect(query.status).toBe(403);

      const body = await call('post', A, A.manager, '/inventory/transfers', {
        fromBranchId: A.branchId,
        toBranchId: B.branchId,
        items: [],
      });
      expect(body.status).toBe(403);
    });

    it('keeps Tenant Admin branch switching available inside the tenant', async () => {
      const response = await call('get', A, A.admin, '/pos/summary', undefined, { 'x-branch-id': A.branch2Id });
      expect(response.status).toBe(200);
    });

    it('allows Tenant Admin query switching to another branch in the same tenant', async () => {
      const response = await call('get', A, A.admin, `/reports/inventory?branchId=${A.branch2Id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.rows.map((row: { branchId: string }) => row.branchId)).toEqual([A.branch2Id]);
    });
  });
});
