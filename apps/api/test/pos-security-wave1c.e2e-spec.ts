/**
 * POS security wave 1C (Step 1B) — remaining server-side audit items, concurrency, tenant isolation, edge cases.
 * Isolated Wave-1 runner only (PostgreSQL :15434 / role hexa_e2e / Redis :16390).
 *
 * Conventions:
 *  - plain `it`          : behaviour that is correct and must stay correct.
 *  - "CHARACTERISATION"  : pins today's behaviour of an open POLICY question; it is not an endorsement.
 *  Step 1B first recorded P-F16, P-F17 and P-F21 as `it.failing` defect documents (each proven to fail for the intended
 *  reason, each with a valid-fixture control). They were fixed afterwards and are ordinary tests now.
 *
 *  P-F15 totals are server-authoritative · P-F16 piece goods fractions (FIXED) · P-F17 drawer movement atomic with the sale
 *  (FIXED) · P-F20 price override by role type (POLICY) · P-F21 recharge quantity (FIXED) · plus duplicate-request,
 *  last-unit concurrency, cross-tenant and malformed-input checks.
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
import * as cashHelper from '../src/shared/cash-register.helper';

jest.setTimeout(300_000);

type Shop = {
  id: string; sub: string; branchId: string; counterId: string;
  milk: { variantId: string; name: string };   // piece good, price 200, cost 150, MRP 220, stock 500
  solo: { variantId: string; name: string };   // piece good, price 100, cost 50, stock exactly 1
  reloadOperatorId: string;
  cashier: string; admin: string; manager: string; allPerms: string; noSales: string;
};

describe('POS security wave 1C (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const PASSWORD = `PSW1C-${Date.now()}-pw!`;
  let A: Shop;
  let B: Shop;
  let seq = 0;
  const key = () => `psw1c-${run}-${(seq++).toString(36)}`;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', 'x-pos-counter-id': s.counterId });
  const call = async (method: 'get' | 'post', s: Shop, token: string, url: string, body?: unknown) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set(hdr(s, token));
    return body === undefined ? r : r.send(body as object);
  };
  const line = (p: { variantId: string; name: string }, quantity: number, unitPrice: number, extra: object = {}) =>
    ({ variantId: p.variantId, productName: p.name, variantName: 'Default', sku: 'SKU', quantity, unitPrice, costPrice: 1, ...extra });
  const sale = (s: Shop, token: string, items: object[], payments: object[] = [{ method: 'CASH', amount: 100_000 }], extra: object = {}) =>
    call('post', s, token, '/pos/sale', { items, payments, applyTierDiscount: false, ...extra });
  const saleCount = (s: Shop) => prisma.sale.count({ where: { tenantId: s.id } });
  const onHand = async (s: Shop, variantId: string) =>
    (await prisma.inventory.aggregate({ where: { tenantId: s.id, variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `pswc${label}${run}`;
    const t = await prisma.tenant.create({
      data: { name: `PSWC ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE', settings: { pos: { allowNegativeStock: false } } },
    });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WHC-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const perms = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    await ensureSystemRoles(prisma, t.id);
    const roleId = async (name: string) => (await prisma.role.findFirstOrThrow({ where: { tenantId: t.id, name } })).id;
    // A CUSTOM role holding EVERY catalogue permission: shows that the price override is tied to the role TYPE (P-F20).
    const everything = await prisma.role.create({ data: { tenantId: t.id, name: 'Everything custom', type: RoleType.CUSTOM, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    const reportsOnly = await prisma.role.create({
      data: { tenantId: t.id, name: 'Reports only', type: RoleType.CUSTOM, permissions: { create: [{ permission: { connect: { resource_action: { resource: 'reports', action: 'read' } } } }] } },
    });
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, rid: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@pswc${label}.test`, passwordHash: hash, firstName: who, lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: rid } } },
    });
    const users = {
      cashier: await mk('cashier', await roleId('Cashier')),
      admin: await mk('admin', await roleId('Tenant Admin')),
      manager: await mk('manager', await roleId('Branch Manager')),
      allPerms: await mk('allperms', everything.id),
      noSales: await mk('nosales', reportsOnly.id),
    };
    const login = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const product = async (name: string, price: number, cost: number, mrp: number, qty: number) => {
      const p = await prisma.product.create({
        data: {
          tenantId: t.id, name: `${name} ${label}`, slug: `${name.toLowerCase()}c-${label}-${run}`, sku: `${name.toUpperCase()}C-${label}-${run}-P`, status: 'ACTIVE',
          sellingPrice: price, costPrice: cost, mrp, unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: false,
          variants: { create: { sku: `${name.toUpperCase()}C-${label}-${run}`, name: 'Default', sellingPrice: price, costPrice: cost, mrp } },
        },
        include: { variants: true },
      });
      await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: p.variants[0].id, quantity: qty, damagedQty: 0, returnedQty: 0 } });
      return { variantId: p.variants[0].id, name: p.name };
    };
    const milk = await product('Milk', 200, 150, 220, 500);
    const solo = await product('Solo', 100, 50, 120, 1);
    const op = await prisma.reloadOperator.create({ data: { tenantId: t.id, code: `DLG-${label}`, name: 'Test operator' } });
    return {
      id: t.id, sub, branchId: branch.id, counterId: counter.id, milk, solo, reloadOperatorId: op.id,
      cashier: await login(users.cashier.email), admin: await login(users.admin.email), manager: await login(users.manager.email),
      allPerms: await login(users.allPerms.email), noSales: await login(users.noSales.email),
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
    expect((await call('post', A, A.cashier, '/cash/open', { openingCash: 5000, counterId: A.counterId })).status).toBe(201);
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 1500)); // let the accounting outbox finish before the DB closes
    await app?.close();
  });

  // ── P-F15 ───────────────────────────────────────────────────────────────
  describe('P-F15 totals are decided by the server', () => {
    it('the client cannot send its own total / subtotal / change (unknown fields are rejected, nothing is written)', async () => {
      const count = await saleCount(A);
      for (const extra of [{ total: 1 }, { subtotal: 1 }, { amountDue: 1 }, { changeDue: 999 }]) {
        const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], extra);
        expect([extra, r.status]).toEqual([extra, 400]);
      }
      expect(await saleCount(A)).toBe(count);
    });
    it('the stored total equals the sum of the stored lines; change on a cash overpayment is exact', async () => {
      const item = line(A.milk, 3, 200);
      const r0 = await sale(A, A.cashier, [item], [{ method: 'CASH', amount: 1000 }]);
      expect(r0.status).toBe(201);
      expect(r0.body.data.total).toBe(600);
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: r0.body.data.id }, include: { items: true, payments: true } });
      expect(Math.round(row.items.reduce((s, i) => s + i.total, 0) * 100) / 100).toBe(row.total);
      expect(row.total).toBe(600);
      // exact change on a cash overpayment
      expect(Number(r0.body.data.changeDue)).toBe(400);
    });
    it('the server ignores the client-side cost and recomputes it (client sent costPrice 1)', async () => {
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBe(201);
      const items = await prisma.saleItem.findMany({ where: { saleId: r.body.data.id } });
      expect(items[0].costPrice).toBe(150);
    });
  });

  // ── P-F16 ───────────────────────────────────────────────────────────────
  describe('P-F16 piece goods and fractional quantities', () => {
    it('CONTROL: a whole quantity of a piece good sells', async () => {
      expect((await sale(A, A.cashier, [line(A.milk, 2, 200)], [{ method: 'CASH', amount: 400 }])).status).toBe(201);
    });
    // FIXED (Step 1B): the API applies the same fraction rule as the POS screen.
    it('0.5 of a piece good (allowDecimalSelling=false, unit pcs) is refused (400); stock and sales untouched', async () => {
      const stock = await onHand(A, A.milk.variantId);
      const count = await saleCount(A);
      const r = await sale(A, A.cashier, [line(A.milk, 0.5, 200)], [{ method: 'CASH', amount: 100 }]);
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toMatch(/sold in whole units/);
      expect(await saleCount(A)).toBe(count);
      expect(await onHand(A, A.milk.variantId)).toBe(stock);
      for (const q of [1.5, 0.001, 2.0001]) expect((await sale(A, A.cashier, [line(A.milk, q, 200)], [{ method: 'CASH', amount: 100_000 }])).status).toBe(400);
    });
    it('products that the screen sells by weight keep selling in fractions: kg unit with the flag still at its default, WEIGHTED kind, and flag on', async () => {
      const mk = async (n: string, data: object) => {
        const p = await prisma.product.create({
          data: {
            tenantId: A.id, name: `Frac ${n}`, slug: `frac-${n}-${run}`, sku: `FRAC-${n}-${run}-P`, status: 'ACTIVE', sellingPrice: 100, costPrice: 50, mrp: 120,
            ...data, variants: { create: { sku: `FRAC-${n}-${run}`, name: 'Default', sellingPrice: 100, costPrice: 50, mrp: 120 } },
          },
          include: { variants: true },
        });
        const inv = await prisma.inventory.findFirstOrThrow({ where: { tenantId: A.id, variantId: A.milk.variantId } });
        await prisma.inventory.create({ data: { tenantId: A.id, branchId: A.branchId, warehouseId: inv.warehouseId, variantId: p.variants[0].id, quantity: 50, damagedQty: 0, returnedQty: 0 } });
        return { variantId: p.variants[0].id, name: p.name };
      };
      const kg = await mk('kg', { unit: 'kg', productKind: ProductKind.STANDARD, allowDecimalSelling: false });   // legacy: column default false
      const weighted = await mk('w', { unit: 'pcs', productKind: ProductKind.WEIGHTED, allowDecimalSelling: false });
      const flagged = await mk('f', { unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: true });
      for (const p of [kg, weighted, flagged]) {
        const r = await sale(A, A.cashier, [line(p, 0.375, 100)], [{ method: 'CASH', amount: 100 }]);
        expect([p.name, r.status]).toEqual([p.name, 201]);
      }
    });
  });

  describe('P-F16 POS return route', () => {
    it('rejects fractional piece returns and accepts a whole-number return', async () => {
      const sold = await sale(A, A.cashier, [line(A.milk, 2, 200)], [{ method: 'CASH', amount: 400 }]);
      expect(sold.status).toBe(201);
      const saleId = sold.body.data.id as string;
      const before = await prisma.return.count({ where: { tenantId: A.id, originalSaleId: saleId } });
      const item = (quantity: number) => ({
        variantId: A.milk.variantId,
        quantity,
        unitPrice: 200,
        productName: A.milk.name,
        variantName: 'Default',
        sku: 'SKU',
      });

      const fractional = await call('post', A, A.cashier, '/pos/returns', {
        clientRequestId: key(),
        originalSaleId: saleId,
        items: [item(0.5)],
      });
      expect(fractional.status).toBe(400);
      expect(await prisma.return.count({ where: { tenantId: A.id, originalSaleId: saleId } })).toBe(before);

      const whole = await call('post', A, A.cashier, '/pos/returns', {
        clientRequestId: key(),
        originalSaleId: saleId,
        items: [item(1)],
      });
      expect(whole.status).toBe(201);
      expect(whole.body.data.items[0].quantity).toBe(1);
    });
  });

  // ── P-F17 ───────────────────────────────────────────────────────────────
  describe('P-F17 drawer movement of a cash sale', () => {
    const movementsOf = (saleId: string) => prisma.cashMovement.count({ where: { tenantId: A.id, reference: saleId } });
    const settleOutbox = () => new Promise((r) => setTimeout(r, 1200));
    it('CONTROL: a cash sale with an open drawer writes exactly one SALE movement', async () => {
      const r = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBe(201);
      await settleOutbox();
      expect(await movementsOf(r.body.data.id)).toBe(1);
    });
    // FIXED (Step 1B): the movement is written inside the sale transaction, so it commits with the sale or not at all.
    it('ATOMIC: if the drawer movement cannot be written the whole sale rolls back (no sale, stock, payments, wallet or invoice left behind); a retry with the same key then succeeds once', async () => {
      const cust = await prisma.customer.create({ data: { tenantId: A.id, firstName: 'Atomic', phone: `07${run.slice(-5).padStart(8, '1')}`, walletBalance: 300, creditLimit: 1000 } });
      const k = key();
      const body = {
        items: [line(A.milk, 1, 200)], payments: [{ method: 'CUSTOMER_CREDIT', amount: 100 }, { method: 'CASH', amount: 100 }],
        applyTierDiscount: false, customerId: cust.id, clientRequestId: k,
      };
      const stock = await onHand(A, A.milk.variantId);
      const count = await saleCount(A);
      const payments = await prisma.salePayment.count({ where: { sale: { tenantId: A.id } } });
      const movements = await prisma.cashMovement.count({ where: { tenantId: A.id } });
      const spy = jest.spyOn(cashHelper, 'recordSaleCashMovement').mockRejectedValueOnce(new Error('simulated drawer failure'));
      try {
        await pace();
        const failed = await request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, A.cashier)).send(body);
        expect(spy).toHaveBeenCalledTimes(1);                         // the failure really happened inside the sale
        expect(failed.status).toBeGreaterThanOrEqual(500);            // the cashier sees an error, never a silent success
        await settleOutbox();
        expect(await saleCount(A)).toBe(count);                        // no sale
        expect(await onHand(A, A.milk.variantId)).toBe(stock);         // stock restored
        expect(await prisma.salePayment.count({ where: { sale: { tenantId: A.id } } })).toBe(payments);
        expect(await prisma.cashMovement.count({ where: { tenantId: A.id } })).toBe(movements);
        const c = await prisma.customer.findUniqueOrThrow({ where: { id: cust.id } });
        expect([c.walletBalance, c.creditBalance]).toEqual([300, 0]);  // wallet / credit untouched
        expect(await prisma.walletTransaction.count({ where: { customerId: cust.id } })).toBe(0);
      } finally {
        spy.mockRestore();
      }
      // The cashier retries with the same key: exactly one sale, one SALE movement of the cash share (100).
      const retry = await request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, A.cashier)).send(body);
      expect(retry.status).toBe(201);
      await settleOutbox();
      expect(await saleCount(A)).toBe(count + 1);
      const moves = await prisma.cashMovement.findMany({ where: { tenantId: A.id, reference: retry.body.data.id } });
      expect(moves).toHaveLength(1);
      expect([moves[0].type, moves[0].amount]).toEqual(['SALE', 100]);
      const c2 = await prisma.customer.findUniqueOrThrow({ where: { id: cust.id } });
      expect([c2.walletBalance, c2.creditBalance]).toEqual([200, 0]);  // 100 of the 'Credit / Wallet' tender came from the wallet, once
    });
    it('the movement and the sale carry the same register; a card-only sale writes no drawer movement', async () => {
      const cash = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: cash.body.data.id } });
      const mv = await prisma.cashMovement.findFirstOrThrow({ where: { tenantId: A.id, reference: cash.body.data.id } });
      expect(mv.registerId).toBe(row.cashRegisterId);
      const card = await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CARD', amount: 200, cardLast4: '4242' }]);
      expect(card.status).toBe(201);
      expect(await prisma.cashMovement.count({ where: { tenantId: A.id, reference: card.body.data.id } })).toBe(0);
    });
  });

  // ── MRP override over HTTP (Step 1B decision 4) ─────────────────────────
  describe('MRP override: reason, audit record and card-number guard over HTTP', () => {
    const above = (token: string, extra: object = {}) => sale(A, token, [line(A.milk, 1, 230)], [{ method: 'CASH', amount: 230 }], extra);
    it('a Cashier cannot sell above MRP, reason or not', async () => {
      const count = await saleCount(A);
      const r = await above(A.cashier, { priceOverrideReason: 'customer insisted' });
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toMatch(/above the allowed maximum/);
      expect(await saleCount(A)).toBe(count);
    });
    it('a Tenant Admin may sell above MRP without a reason (still audited); a reason, when sent, is stored on the audit row', async () => {
      const count = await saleCount(A);
      const none = await above(A.admin);
      expect(none.status).toBe(201);
      expect(await saleCount(A)).toBe(count + 1);
      const noneAudit = await prisma.auditLog.findMany({ where: { tenantId: A.id, resource: 'SalePriceOverride', resourceId: none.body.data.id } });
      expect(noneAudit).toHaveLength(1);
      const ok = await above(A.admin, { priceOverrideReason: 'Shelf label misprinted, price confirmed with supplier' });
      expect(ok.status).toBe(201);
      const audit = await prisma.auditLog.findMany({ where: { tenantId: A.id, resource: 'SalePriceOverride', resourceId: ok.body.data.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('APPROVE');
      expect(audit[0].userId).toBeTruthy();
      expect(audit[0].newData).toMatchObject({ reason: 'Shelf label misprinted, price confirmed with supplier', kind: 'ABOVE_MAX_PRICE' });
    });
    it('the reason cannot carry a card number (nothing written)', async () => {
      const count = await saleCount(A);
      const r = await above(A.admin, { priceOverrideReason: 'paid with 4111 1111 1111 1111' });
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
    });
    it('a Branch Manager (sales:create) may override with a reason; the audit row names the manager', async () => {
      const ok = await above(A.manager, { priceOverrideReason: 'Manager approved price' });
      expect(ok.status).toBe(201);
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: A.id, resourceId: ok.body.data.id, resource: 'SalePriceOverride' } });
      const mgr = await prisma.user.findFirstOrThrow({ where: { tenantId: A.id, email: { startsWith: 'manager-' } } });
      expect(audit.userId).toBe(mgr.id);
    });
  });

  // ── parallel cash sales: the in-transaction drawer movement must not deadlock or lose a movement ──
  describe('parallel cash sales on one drawer', () => {
    // KNOWN PRE-EXISTING RACE (Step 1C finding F-C3, NOT caused by the drawer movement - card-only sales show it too): the
    // document-number allocator can hand two concurrent checkouts the same invoice number, so one of them is rolled back with
    // 409 `Unique constraint violation on field(s): tenantId, invoiceNumber`. That 409 is the ONLY tolerated outcome besides
    // 201; remove the tolerance when the allocator is fixed (owner approval pending).
    it('8 simultaneous cash sales by the same cashier: every success has exactly one movement; nothing is lost, doubled or deadlocked', async () => {
      const stock = await onHand(A, A.milk.variantId);
      const send = () => request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, A.cashier))
        .send({ items: [line(A.milk, 1, 200)], payments: [{ method: 'CASH', amount: 200 }], applyTierDiscount: false, clientRequestId: key() });
      await pace();
      const results = await Promise.all(Array.from({ length: 8 }, () => send()));
      const knownNumbering409 = (r: { status: number; body: { message?: unknown } }) =>
        r.status === 409 && /tenantId, invoiceNumber/.test(String(r.body?.message));
      for (const r of results) expect(r.status === 201 || knownNumbering409(r)).toBe(true);   // no deadlock, no 5xx, no other error
      const ok = results.filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThanOrEqual(6);
      const ids = ok.map((r) => r.body.data.id as string);
      expect(new Set(ids).size).toBe(ok.length);
      expect(await prisma.cashMovement.count({ where: { tenantId: A.id, reference: { in: ids }, type: 'SALE' } })).toBe(ok.length);
      // all successful sales used the cashier's one open drawer, and each wrote its movement on THAT register
      const registers = [...new Set((await prisma.sale.findMany({ where: { id: { in: ids } }, select: { cashRegisterId: true } })).map((x) => x.cashRegisterId))];
      expect(registers).toHaveLength(1);
      const mv = await prisma.cashMovement.aggregate({ where: { registerId: registers[0]!, reference: { in: ids }, type: 'SALE' }, _sum: { amount: true }, _count: true });
      expect(mv._count).toBe(ok.length);                                                      // a rolled-back sale left no movement
      expect(Math.round((mv._sum.amount ?? 0) * 100) / 100).toBe(200 * ok.length);
      expect(await onHand(A, A.milk.variantId)).toBe(stock - ok.length);                       // ... and no stock
    });
  });

  // ── P-F20 ───────────────────────────────────────────────────────────────
  describe('P-F20 price override is tied to the role TYPE (policy question)', () => {
    it('CHARACTERISATION: a CUSTOM role holding every permission still cannot sell below cost; a Tenant Admin can and it is recorded', async () => {
      const count = await saleCount(A);
      const denied = await sale(A, A.allPerms, [line(A.milk, 1, 100)], [{ method: 'CASH', amount: 100 }]);
      expect(denied.status).toBe(400);
      expect(String(denied.body.message)).toMatch(/below cost/);
      expect(await saleCount(A)).toBe(count);
      const ok = await sale(A, A.admin, [line(A.milk, 1, 100)], [{ method: 'CASH', amount: 100 }]);
      expect(ok.status).toBe(201);
      const row = await prisma.sale.findUniqueOrThrow({ where: { id: ok.body.data.id } });
      expect((row.metadata as { priceOverrides?: Array<{ kind: string }> }).priceOverrides?.[0].kind).toBe('BELOW_COST');
    });
  });

  // ── P-F21 ───────────────────────────────────────────────────────────────
  describe('P-F21 recharge-card quantity', () => {
    const reload = (qty: number) => ({
      isCustom: true, productName: 'Mobile reload', variantName: '', sku: 'RELOAD', quantity: qty, unitPrice: 100, costPrice: 1,
      reloadType: 'DIGITAL', reloadOperatorId: A.reloadOperatorId, reloadFaceValue: 100, reloadMsisdn: '0771234567',
    });
    it('CONTROL: a whole number of recharge items sells and records exactly that many reload sales', async () => {
      const before = await prisma.reloadSale.count({ where: { tenantId: A.id } });
      const r = await sale(A, A.cashier, [reload(2)], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBe(201);
      expect(await prisma.reloadSale.count({ where: { tenantId: A.id } })).toBe(before + 2);
    });
    // FIXED (Step 1B): every unit is its own ReloadSale (a physical card has its own PIN); a fraction has no meaning.
    it('a fractional reload / recharge quantity is refused (400): the customer never pays for units that are not recorded', async () => {
      const count = await saleCount(A);
      const reloads = await prisma.reloadSale.count({ where: { tenantId: A.id } });
      for (const q of [2.5, 0.5, 1.0001]) {
        const r = await sale(A, A.cashier, [reload(q)], [{ method: 'CASH', amount: 1000 }]);
        expect([q, r.status]).toEqual([q, 400]);
        expect(String(r.body.message)).toMatch(/whole number of units/);
      }
      expect(await saleCount(A)).toBe(count);
      expect(await prisma.reloadSale.count({ where: { tenantId: A.id } })).toBe(reloads);
    });
    it('charged quantity = recorded quantity for several whole quantities (1, 3, 5 units)', async () => {
      for (const q of [1, 3, 5]) {
        const before = await prisma.reloadSale.count({ where: { tenantId: A.id } });
        const r = await sale(A, A.cashier, [reload(q)], [{ method: 'CASH', amount: 100 * q }]);
        expect([q, r.status]).toEqual([q, 201]);
        expect(await prisma.reloadSale.count({ where: { tenantId: A.id } })).toBe(before + q);
        expect(r.body.data.total).toBe(100 * q);
      }
    });
  });

  // ── duplicate requests and concurrency ──────────────────────────────────
  describe('duplicate and concurrent sales', () => {
    it('the same clientRequestId sent twice at once (double click) creates one sale and deducts stock once', async () => {
      const k = key();
      const stock = await onHand(A, A.milk.variantId);
      const count = await saleCount(A);
      const send = () => request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, A.cashier))
        .send({ items: [line(A.milk, 1, 200)], payments: [{ method: 'CASH', amount: 200 }], applyTierDiscount: false, clientRequestId: k });
      await pace();
      const [x, y] = await Promise.all([send(), send()]);
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.body.data.id).toBe(y.body.data.id);
      expect(await saleCount(A)).toBe(count + 1);
      expect(await onHand(A, A.milk.variantId)).toBe(stock - 1);
    });
    it('the same clientRequestId with a DIFFERENT cart is refused and creates nothing', async () => {
      const k = key();
      expect((await sale(A, A.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }], { clientRequestId: k })).status).toBe(201);
      const count = await saleCount(A);
      const other = await sale(A, A.cashier, [line(A.milk, 2, 200)], [{ method: 'CASH', amount: 400 }], { clientRequestId: k });
      expect(other.status).toBeGreaterThanOrEqual(400);
      expect(other.status).toBeLessThan(500);
      expect(await saleCount(A)).toBe(count);
    });
    it('two cashiers selling the LAST unit at the same moment: exactly one wins, stock never goes negative', async () => {
      expect(await onHand(A, A.solo.variantId)).toBe(1);
      const send = (token: string) => request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, token))
        .send({ items: [line(A.solo, 1, 100)], payments: [{ method: 'CASH', amount: 100 }], applyTierDiscount: false, clientRequestId: key() });
      await pace();
      const [x, y] = await Promise.all([send(A.cashier), send(A.admin)]);
      expect([x.status, y.status].sort()).toEqual([201, 400]);
      expect(await onHand(A, A.solo.variantId)).toBe(0);
      expect(await prisma.saleItem.count({ where: { sale: { tenantId: A.id }, variantId: A.solo.variantId } })).toBe(1);
    });
  });

  // ── P-F3 per-shop scale label interpretation ────────────────────────────
  describe('P-F3 scale label mode is a per-shop setting (AUTO keeps the existing behaviour)', () => {
    let rice: { variantId: string; name: string };
    const ean = (value5: string) => {
      const twelve = `20${'12345'}${value5}`;
      const sum = twelve.split('').map(Number).reduce((x, d, idx) => x + d * (idx % 2 === 0 ? 1 : 3), 0);
      return `${twelve}${(10 - (sum % 10)) % 10}`;
    };
    const setMode = async (token: string, mode: unknown) => {
      await pace();
      return request(app.getHttpServer()).put('/api/v1/tenants/pos-settings').set(hdr(A, token)).send({ scaleBarcodeMode: mode });
    };
    const getMode = async () => (await call('get', A, A.admin, '/tenants/pos-settings')).body.data.scaleBarcodeMode;
    const scan = (value5: string, quantity: number, token = A.cashier) =>
      sale(A, token, [line(rice, quantity, 250, { scaleBarcodes: [ean(value5)] })], [{ method: 'CASH', amount: 100_000 }]);

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: {
          tenantId: A.id, name: `Scale rice ${run}`, slug: `scale-rice-${run}`, sku: `SCR-${run}-P`, status: 'ACTIVE', sellingPrice: 250, costPrice: 200, mrp: 300,
          unit: 'kg', productKind: ProductKind.WEIGHTED, allowDecimalSelling: true,
          variants: { create: { sku: `SCR-${run}`, name: 'Default', sellingPrice: 250, costPrice: 200, mrp: 300, barcode: '12345' } },
        },
        include: { variants: true },
      });
      const inv = await prisma.inventory.findFirstOrThrow({ where: { tenantId: A.id, variantId: A.milk.variantId } });
      await prisma.inventory.create({ data: { tenantId: A.id, branchId: A.branchId, warehouseId: inv.warehouseId, variantId: p.variants[0].id, quantity: 500, damagedQty: 0, returnedQty: 0 } });
      rice = { variantId: p.variants[0].id, name: p.name };
    });
    afterAll(async () => { await setMode(A.admin, 'AUTO'); });

    it('a shop that never set the mode reads AUTO and behaves exactly as before (value 3.00 is a price: 0.012 kg)', async () => {
      expect(await getMode()).toBe('AUTO');
      expect((await scan('00300', 0.3)).status).toBe(400);                  // 0.3 kg is NOT what an AUTO shop's label means
      expect((await scan('00300', 0.012)).status).toBe(201);               // ... it means LKR 3.00 = 0.012 kg
    });

    it('only a Tenant Admin can change it, and only to a valid value', async () => {
      expect((await setMode(A.cashier, 'WEIGHT')).status).toBe(403);
      for (const bad of ['GRAMS', '', 1, 'auto ', 'Weight']) expect([bad, (await setMode(A.admin, bad)).status]).toEqual([bad, 400]);
      expect(await getMode()).toBe('AUTO');
      expect((await setMode(A.admin, null)).status).toBe(200);   // null = "not provided", like every other POS setting: no change
      expect(await getMode()).toBe('AUTO');
    });

    it('WEIGHT mode: the same label means 300 g', async () => {
      expect((await setMode(A.admin, 'WEIGHT')).status).toBe(200);
      expect(await getMode()).toBe('WEIGHT');
      const stock = await onHand(A, rice.variantId);
      expect((await scan('00300', 0.012)).status).toBe(400);               // the price reading is no longer accepted
      expect(await onHand(A, rice.variantId)).toBe(stock);
      const ok = await scan('00300', 0.3);
      expect(ok.status).toBe(201);
      expect(await onHand(A, rice.variantId)).toBeCloseTo(stock - 0.3, 6);
      expect((await scan('01250', 1.25)).status).toBe(201);                // heavier than 1 kg: no price/weight ambiguity
    });

    it('PRICE mode: the label value is always a price', async () => {
      expect((await setMode(A.admin, 'PRICE')).status).toBe(200);
      expect((await scan('02500', 0.1)).status).toBe(201);                  // LKR 25.00 / 250 = 0.1 kg
      expect((await scan('02500', 25)).status).toBe(400);                  // never the weight reading
      expect((await scan('00050', 0.002)).status).toBe(201);               // LKR 0.50 is a price here, not 50 g
    });

    it('the barcode lookup returns the same quantity the sale will accept, in every mode (screen and server never disagree)', async () => {
      const lookupQty = async (value5: string) => {
        const r = await call('get', A, A.cashier, `/pos/barcode/${ean(value5)}`);
        expect(r.status).toBe(200);
        const rows = Array.isArray(r.body.data) ? r.body.data : [r.body.data];
        const hit = rows.find((x: { variantId?: string }) => x?.variantId === rice.variantId) ?? rows[0];
        return hit?.scaleQty as number | undefined;
      };
      expect((await setMode(A.admin, 'AUTO')).status).toBe(200);
      expect(await lookupQty('00300')).toBe(0.012);
      expect((await setMode(A.admin, 'WEIGHT')).status).toBe(200);
      expect(await lookupQty('00300')).toBe(0.3);
      expect((await setMode(A.admin, 'PRICE')).status).toBe(200);
      expect(await lookupQty('02500')).toBe(0.1);
      // and the quantity the lookup returned is accepted by the sale in the same mode
      expect((await scan('02500', 0.1)).status).toBe(201);
      expect((await setMode(A.admin, 'AUTO')).status).toBe(200);
    });

    it('the mode is per shop: shop B is still AUTO; switching back restores AUTO; a wrong-evidence label is still refused', async () => {
      await pace();
      const b = await request(app.getHttpServer()).get('/api/v1/tenants/pos-settings').set(hdr(B, B.admin));
      expect(b.body.data.scaleBarcodeMode).toBe('AUTO');
      expect((await setMode(A.admin, 'AUTO')).status).toBe(200);
      expect(await getMode()).toBe('AUTO');
      const good = ean('00300');
      const other = good.slice(0, 12) + String((Number(good[12]) + 1) % 10);   // wrong check digit
      expect((await sale(A, A.cashier, [line(rice, 0.012, 250, { scaleBarcodes: [other] })], [{ method: 'CASH', amount: 100_000 }])).status).toBe(400);
    });
  });

  // ── tenant isolation, authorisation, malformed input ────────────────────
  describe('tenant isolation, authorisation and malformed requests', () => {
    it("shop B cannot sell shop A's product: refused, A's stock and sales untouched", async () => {
      const stock = await onHand(A, A.milk.variantId);
      const countA = await saleCount(A);
      const countB = await saleCount(B);
      const r = await sale(B, B.cashier, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(await onHand(A, A.milk.variantId)).toBe(stock);
      expect(await saleCount(A)).toBe(countA);
      expect(await saleCount(B)).toBe(countB);
    });
    it("a token of shop B presented with shop A's tenant header is refused", async () => {
      await pace();
      const r = await request(app.getHttpServer()).post('/api/v1/pos/sale')
        .set({ Authorization: `Bearer ${B.cashier}`, 'x-tenant-id': A.sub, Host: 'localhost', 'x-pos-counter-id': A.counterId })
        .send({ items: [line(A.milk, 1, 200)], payments: [{ method: 'CASH', amount: 200 }], applyTierDiscount: false });
      expect([401, 403]).toContain(r.status);
    });
    it('no token -> 401; a user without sales permission -> 403; nothing written', async () => {
      const count = await saleCount(A);
      await pace();
      const anon = await request(app.getHttpServer()).post('/api/v1/pos/sale').set({ 'x-tenant-id': A.sub, Host: 'localhost' })
        .send({ items: [line(A.milk, 1, 200)], payments: [{ method: 'CASH', amount: 200 }] });
      expect(anon.status).toBe(401);
      const nosales = await sale(A, A.noSales, [line(A.milk, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(nosales.status).toBe(403);
      expect(await saleCount(A)).toBe(count);
    });
    it.each([
      ['zero quantity', () => ({ items: [line(A.milk, 0, 200)] })],
      ['negative quantity', () => ({ items: [line(A.milk, -1, 200)] })],
      ['negative price', () => ({ items: [line(A.milk, 1, -200)] })],
      ['no lines (regression: an empty cart used to create invoice + total-0 sale)', () => ({ items: [] })],
      ['no payments', () => ({ payments: [] })],
      ['negative payment', () => ({ payments: [{ method: 'CASH', amount: -200 }] })],
      ['unknown payment method', () => ({ payments: [{ method: 'BITCOIN', amount: 200 }] })],
      ['text quantity', () => ({ items: [{ ...line(A.milk, 1, 200), quantity: 'two' }] })],
    ])('malformed request: %s -> 400 and nothing is written', async (_label, override) => {
      const count = await saleCount(A);
      const stock = await onHand(A, A.milk.variantId);
      await pace();
      const r = await request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, A.cashier))
        .send({ items: [line(A.milk, 1, 200)], payments: [{ method: 'CASH', amount: 200 }], applyTierDiscount: false, ...override() });
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
      expect(await onHand(A, A.milk.variantId)).toBe(stock);
    });
    it('a quantity larger than the stock is refused when negative stock is not allowed', async () => {
      const count = await saleCount(A);
      const r = await sale(A, A.cashier, [line(A.milk, 100_000, 200)], [{ method: 'CASH', amount: 20_000_000 }]);
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
    });
  });
});
