/**
 * DRAFT - requires DB, NOT RUN. Stock / Supplier security, wave 1 (S-F7, S-F8, S-F10, supplier invoice validation).
 *
 * Needs DATABASE_URL (an empty TEST database with the schema applied) + REDIS_HOST / REDIS_PORT / REDIS_PASSWORD,
 * like po-grn-stock-sync.e2e-spec.ts. Never point it at production.
 *   pnpm --filter ./apps/api test:e2e -- stock-supplier-security-wave1
 *
 * Two shops (A, B), each with the REAL default roles (ensureSystemRoles): Tenant Admin and Cashier. Shop A's users
 * try to write through shop B's ids; every case asserts the HTTP status AND that B's rows are unchanged.
 * Accounting outcomes (credit amount, GL) are deliberately NOT asserted here: they are open decisions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { PurchaseOrderStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { ensureSystemRoles } from '../src/modules/roles/default-system-roles';

jest.setTimeout(300_000);

type Shop = { id: string; sub: string; branchId: string; branch2Id: string; supplierId: string; admin: string; cashier: string };

describe('Stock / Supplier security wave 1 (HTTP + DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const PASSWORD = `SSW-${Date.now()}-pw!`;
  let A: Shop;
  let B: Shop;
  let seq = 0;

  const pace = () => new Promise((r) => setTimeout(r, 320)); // stay under the login / write throttles
  const hdr = (s: Shop, token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost' });
  const post = async (s: Shop, token: string, url: string, body: object) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s, token)).send(body);
  };
  const put = async (s: Shop, token: string, url: string, body: object) => {
    await pace();
    return request(app.getHttpServer()).put(`/api/v1${url}`).set(hdr(s, token)).send(body);
  };
  const onHand = async (s: Shop, variantId: string, branchId?: string) =>
    (await prisma.inventory.aggregate({ where: { tenantId: s.id, variantId, ...(branchId ? { branchId } : {}) }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const key = (l: string) => `ssw-${run}-${l}-${++seq}`.slice(0, 64);

  async function variant(s: Shop, label: string, o: { sell?: number; cost?: number; mrp?: number } = {}) {
    const n = ++seq;
    const p = await prisma.product.create({
      data: {
        tenantId: s.id, name: `${label} ${run}`, slug: `${label.toLowerCase()}-${run}-${n}`, sku: `${label}-${run}-${n}`, status: 'ACTIVE',
        sellingPrice: o.sell ?? 150, costPrice: o.cost ?? 100, mrp: o.mrp ?? 180,
        variants: { create: { sku: `${label}-${run}-${n}-V`, name: 'Default', sellingPrice: o.sell ?? 150, costPrice: o.cost ?? 100, mrp: o.mrp ?? 180 } },
      },
      include: { variants: true },
    });
    return p.variants[0];
  }
  const grnLine = (v: { id: string }, receivedQty: number, unitCost: number, extra: object = {}) =>
    ({ variantId: v.id, productName: 'P', variantName: 'Default', sku: 'S', receivedQty, unitCost, ...extra });
  const poItem = (v: { id: string }, orderedQty: number, unitCost: number) =>
    ({ variantId: v.id, productName: 'P', variantName: 'Default', sku: 'S', orderedQty, unitCost });
  const retLine = (v: { id: string }, quantity: number, unitCost = 100, extra: object = {}) =>
    ({ variantId: v.id, productName: 'P', sku: 'S', quantity, unitCost, ...extra });

  async function confirmedPo(s: Shop, items: object[]) {
    const r = await post(s, s.admin, '/purchases', { supplierId: s.supplierId, items, clientRequestId: key('po') });
    expect(r.status).toBe(201);
    await prisma.purchaseOrder.update({ where: { id: r.body.data.id }, data: { status: PurchaseOrderStatus.CONFIRMED } });
    return prisma.purchaseOrder.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { items: true } });
  }
  async function directGrn(s: Shop, lines: object[]) {
    const r = await post(s, s.admin, '/procurement/grn/direct', { supplierId: s.supplierId, lines, clientRequestId: key('dg') });
    expect(r.status).toBe(201);
    return r.body.data as { id: string; grnNumber: string };
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `ssw${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `SSW ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const branch2 = await prisma.branch.create({ data: { tenantId: t.id, name: 'Second', code: 'SEC' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}-${run}`, isDefault: true } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch2.id, name: 'Second', code: `WH2-${label}-${run}`, isDefault: true } });
    await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    await ensureSystemRoles(prisma, t.id);
    const roleId = async (name: string) => (await prisma.role.findFirstOrThrow({ where: { tenantId: t.id, name } })).id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, rid: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@ssw${label}.test`, passwordHash: hash, firstName: who, lastName: label,
        status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: rid } } },
    });
    const admin = await mk('admin', await roleId('Tenant Admin'));
    const cashier = await mk('cashier', await roleId('Cashier'));
    const login = async (email: string) => {
      await pace();
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
      return r.body.data.accessToken as string;
    };
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: `Supplier ${label}`, phone: '0770000000' } });
    return { id: t.id, sub, branchId: branch.id, branch2Id: branch2.id, supplierId: supplier.id, admin: await login(admin.email), cashier: await login(cashier.email) };
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

  // ── S-F8 cross-tenant ids ─────────────────────────────────────────────
  describe('S-F8 cross-tenant ids', () => {
    it("direct GRN in A naming B's variant: refused; B's price / MRP / cost and stock untouched", async () => {
      const vB = await variant(B, 'XV', { sell: 150, cost: 100, mrp: 180 });
      const r = await post(A, A.admin, '/procurement/grn/direct', { supplierId: A.supplierId, clientRequestId: key('dgx'),
        lines: [grnLine(vB, 5, 1, { sellingPrice: 1, mrp: 1 })] });
      expect(r.status).toBe(400);
      const after = await prisma.productVariant.findUniqueOrThrow({ where: { id: vB.id } });
      expect([after.sellingPrice, after.mrp, after.costPrice]).toEqual([150, 180, 100]);
      expect(await prisma.inventory.count({ where: { variantId: vB.id } })).toBe(0);
      expect(await prisma.goodsReceiptItem.count({ where: { variantId: vB.id } })).toBe(0);
    });

    it("Quick GRN by A's default Cashier naming B's supplier: 404, nothing received, B's supplier balance unchanged", async () => {
      const v = await variant(A, 'QS');
      const before = await prisma.supplier.findUniqueOrThrow({ where: { id: B.supplierId } });
      const r = await post(A, A.cashier, '/procurement/grn/quick', { supplierId: B.supplierId, lines: [{ variantId: v.id, quantity: 3, unitCost: 10 }], clientRequestId: key('qs') });
      expect(r.status).toBe(404);
      expect(await onHand(A, v.id)).toBe(0);
      expect((await prisma.supplier.findUniqueOrThrow({ where: { id: B.supplierId } })).balance).toBe(before.balance);
      expect(await prisma.supplierLedgerEntry.count({ where: { supplierId: B.supplierId, tenantId: A.id } })).toBe(0);
    });

    it("direct GRN / PO / purchase request naming B's supplier or variant: refused, nothing created in A", async () => {
      const v = await variant(A, 'XS');
      const vB = await variant(B, 'XS-B');
      const pos = await prisma.purchaseOrder.count({ where: { tenantId: A.id } });
      expect((await post(A, A.admin, '/procurement/grn/direct', { supplierId: B.supplierId, clientRequestId: key('dgs'), lines: [grnLine(v, 1, 1)] })).status).toBe(404);
      expect((await post(A, A.admin, '/purchases', { supplierId: B.supplierId, items: [poItem(v, 1, 1)], clientRequestId: key('pos') })).status).toBe(404);
      expect((await post(A, A.admin, '/purchases', { supplierId: A.supplierId, items: [poItem(vB, 1, 1)], clientRequestId: key('pov') })).status).toBe(400);
      expect((await post(A, A.admin, '/procurement/purchase-requests', { items: [{ variantId: vB.id, productName: 'P', variantName: 'D', sku: 'S', requestedQty: 1 }] })).status).toBe(400);
      expect(await prisma.purchaseOrder.count({ where: { tenantId: A.id } })).toBe(pos);
    });

    it("direct GRN line pointing at B's purchase-order line: refused", async () => {
      const vB = await variant(B, 'PI-B');
      const poB = await confirmedPo(B, [poItem(vB, 5, 10)]);
      const vA = await variant(A, 'PI-A');
      const r = await post(A, A.admin, '/procurement/grn/direct', { supplierId: A.supplierId, clientRequestId: key('dgpi'),
        lines: [grnLine(vA, 1, 1, { purchaseItemId: poB.items[0].id })] });
      expect(r.status).toBe(400);
      expect(await prisma.goodsReceiptItem.count({ where: { purchaseItemId: poB.items[0].id } })).toBe(0);
    });

    it("stock adjust in A with B's lotId (or B's variant): refused; B's lot never incremented", async () => {
      const vB = await variant(B, 'XL');
      const lotB = await prisma.inventoryLot.create({ data: { tenantId: B.id, branchId: B.branchId, variantId: vB.id, quantity: 5, reservedQty: 0, unitCost: 10, batchNumber: 'B-LOT' } });
      const vA = await variant(A, 'XL-A');
      const r1 = await post(A, A.admin, '/inventory/adjust', { variantId: vA.id, quantity: 100, movementType: 'PURCHASE', lotId: lotB.id, clientRequestId: key('adjl') });
      expect(r1.status).toBe(400);
      const r2 = await post(A, A.admin, '/inventory/adjust', { variantId: vB.id, quantity: 100, movementType: 'PURCHASE', unitCost: 1, clientRequestId: key('adjv') });
      expect(r2.status).toBe(400);
      expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotB.id } })).quantity).toBe(5);
      expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: vB.id } })).costPrice).toBe(100);
      expect(await prisma.inventory.count({ where: { variantId: { in: [vA.id, vB.id] }, tenantId: A.id } })).toBe(0);
    });

    it("CONTROL: adjust with A's own lot of the same variant tops it up", async () => {
      const vA = await variant(A, 'OWNLOT');
      const lotA = await prisma.inventoryLot.create({ data: { tenantId: A.id, branchId: A.branchId, variantId: vA.id, quantity: 2, reservedQty: 0, unitCost: 10, batchNumber: 'A-LOT' } });
      const r = await post(A, A.admin, '/inventory/adjust', { variantId: vA.id, quantity: 3, movementType: 'PURCHASE', lotId: lotA.id, unitCost: 10, clientRequestId: key('adjown') });
      expect(r.status).toBe(201);
      expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lotA.id } })).quantity).toBe(5);
    });

    it("supplier return in A with B's purchaseId / goodsReceiptId: refused; B's PO paidAmount unchanged", async () => {
      const vB = await variant(B, 'XR');
      const poB = await confirmedPo(B, [poItem(vB, 10, 100)]);
      const grnB = await directGrn(B, [grnLine(vB, 4, 100)]);
      const vA = await variant(A, 'XR-A');
      await directGrn(A, [grnLine(vA, 5, 100)]);
      const before = await prisma.supplierReturn.count({ where: { tenantId: A.id } });
      expect((await post(A, A.cashier, '/procurement/supplier-returns', { supplierId: A.supplierId, purchaseId: poB.id, items: [retLine(vA, 1)] })).status).toBe(404);
      expect((await post(A, A.cashier, '/procurement/supplier-returns', { supplierId: A.supplierId, goodsReceiptId: grnB.id, items: [retLine(vA, 1)] })).status).toBe(404);
      expect(await prisma.supplierReturn.count({ where: { tenantId: A.id } })).toBe(before);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poB.id } })).paidAmount).toBe(0);
    });

    it("a legacy DRAFT return (written before the fix) pointing at B's PO cannot be posted; B's PO untouched", async () => {
      const vB = await variant(B, 'LEG');
      const poB = await confirmedPo(B, [poItem(vB, 10, 100)]);
      const vA = await variant(A, 'LEG-A');
      await directGrn(A, [grnLine(vA, 5, 100)]);
      const draft = await prisma.supplierReturn.create({ data: { tenantId: A.id, branchId: A.branchId, returnNumber: `LEG-${run}`, supplierId: A.supplierId, purchaseId: poB.id, status: 'DRAFT',
        items: { create: [{ variantId: vA.id, productName: 'P', sku: 'S', quantity: 1, unitCost: 100 }] } } });
      const r = await post(A, A.admin, `/procurement/supplier-returns/${draft.id}/post`, {});
      expect(r.status).toBe(404);
      expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poB.id } })).paidAmount).toBe(0);
      expect((await prisma.supplierReturn.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT'); // rolled back
      expect(await onHand(A, vA.id)).toBe(5);
    });

    it("supplier invoice in A naming B's supplier / PO / GRN: 404, nothing created", async () => {
      const vB = await variant(B, 'XI');
      const poB = await confirmedPo(B, [poItem(vB, 1, 10)]);
      const grnB = await directGrn(B, [grnLine(vB, 1, 10)]);
      const before = await prisma.supplierInvoice.count({ where: { tenantId: A.id } });
      for (const body of [
        { supplierId: B.supplierId, invoiceNumber: `X1-${run}`, subtotal: 10, post: true },
        { supplierId: A.supplierId, invoiceNumber: `X2-${run}`, purchaseId: poB.id, subtotal: 10 },
        { supplierId: A.supplierId, invoiceNumber: `X3-${run}`, goodsReceiptId: grnB.id, subtotal: 10 },
      ]) {
        expect((await post(A, A.admin, '/procurement/supplier-invoices', body)).status).toBe(404);
      }
      expect(await prisma.supplierInvoice.count({ where: { tenantId: A.id } })).toBe(before);
    });

    it("transfer in A naming B's variant or B's branch as source: refused", async () => {
      const vB = await variant(B, 'XT');
      const vA = await variant(A, 'XT-A');
      expect((await post(A, A.admin, '/inventory/transfers', { toBranchId: A.branch2Id, items: [{ variantId: vB.id, requestedQty: 1 }] })).status).toBe(400);
      const before = await prisma.stockTransfer.count({ where: { tenantId: A.id } });
      expect((await post(A, A.admin, '/inventory/transfers', { fromBranchId: B.branchId, toBranchId: A.branch2Id, items: [{ variantId: vA.id, requestedQty: 1 }] })).status).toBe(403);
      expect(await prisma.stockTransfer.count({ where: { tenantId: A.id } })).toBe(before);
    });
  });

  // ── S-F7 supplier return lines ────────────────────────────────────────
  describe('S-F7 supplier return line validation', () => {
    const ret = (token: string, body: object) => post(A, token, '/procurement/supplier-returns', body);

    it('negative / zero quantity, negative unit cost, missing variantId, unknown field: 400 and nothing created', async () => {
      const v = await variant(A, 'R7');
      const before = await prisma.supplierReturn.count({ where: { tenantId: A.id } });
      for (const bad of [retLine(v, -5), retLine(v, 0), retLine(v, 1, -100), { productName: 'P', sku: 'S', quantity: 1 }, retLine(v, 1, 100, { tenantId: B.id })]) {
        expect((await ret(A.cashier, { supplierId: A.supplierId, items: [bad] })).status).toBe(400);
      }
      expect(await prisma.supplierReturn.count({ where: { tenantId: A.id } })).toBe(before);
    });

    it('more than the GRN received is refused; up to what is left is accepted; a second draft over the remainder cannot be posted', async () => {
      const v = await variant(A, 'R7G');
      const grn = await directGrn(A, [grnLine(v, 10, 100)]);
      expect((await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(v, 50)] })).status).toBe(400);
      const first = await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(v, 6)] });
      const second = await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(v, 6)] });
      expect([first.status, second.status]).toEqual([201, 201]); // drafts: only POSTED returns consume the GRN
      expect((await post(A, A.admin, `/procurement/supplier-returns/${first.body.data.id}/post`, {})).status).toBe(201);
      expect((await post(A, A.admin, `/procurement/supplier-returns/${second.body.data.id}/post`, {})).status).toBe(400);
      expect(await onHand(A, v.id)).toBe(4);
    });

    it('two different drafts posted at the same moment cannot together exceed the GRN', async () => {
      const v = await variant(A, 'R7C');
      const grn = await directGrn(A, [grnLine(v, 10, 100)]);
      const d1 = await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(v, 7)] });
      const d2 = await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(v, 7)] });
      const [p1, p2] = await Promise.all([
        request(app.getHttpServer()).post(`/api/v1/procurement/supplier-returns/${d1.body.data.id}/post`).set(hdr(A, A.admin)).send({}),
        request(app.getHttpServer()).post(`/api/v1/procurement/supplier-returns/${d2.body.data.id}/post`).set(hdr(A, A.admin)).send({}),
      ]);
      expect([p1.status, p2.status].sort()).toEqual([201, 400]);
      expect(await onHand(A, v.id)).toBe(3);
    });

    it('a variant that was not on the GRN is refused', async () => {
      const v = await variant(A, 'R7N');
      const other = await variant(A, 'R7O');
      const grn = await directGrn(A, [grnLine(v, 10, 100)]);
      expect((await ret(A.cashier, { supplierId: A.supplierId, goodsReceiptId: grn.id, items: [retLine(other, 1)] })).status).toBe(400);
    });

    it('CONTROL: the web purchase-return payload (PO link, decimal qty) still works after receipt', async () => {
      const v = await variant(A, 'R7W');
      const po = await confirmedPo(A, [poItem(v, 10, 100)]);
      expect((await post(A, A.admin, `/purchases/${po.id}/receive`, { items: [{ itemId: po.items[0].id, receivedQty: 10 }], clientRequestId: key('rcv') })).status).toBe(201);
      const r = await ret(A.cashier, { supplierId: A.supplierId, purchaseId: po.id, reason: 'Damaged', items: [retLine(v, 2.5, 100)] });
      expect(r.status).toBe(201);
    });
  });

  // ── Supplier invoice amounts (validation only) ────────────────────────
  describe('supplier invoice amount validation', () => {
    it.each([
      ['negative taxAmount', { subtotal: 100, taxAmount: -50 }],
      ['negative subtotal', { subtotal: -1 }],
      ['string subtotal', { subtotal: 'abc' }],
    ])('%s: 400, nothing created', async (_n, amounts) => {
      const before = await prisma.supplierInvoice.count({ where: { tenantId: A.id } });
      const r = await post(A, A.admin, '/procurement/supplier-invoices', { supplierId: A.supplierId, invoiceNumber: `NEG-${run}-${++seq}`, post: true, ...amounts });
      expect(r.status).toBe(400);
      expect(await prisma.supplierInvoice.count({ where: { tenantId: A.id } })).toBe(before);
    });
    it('CONTROL: the web supplier-invoice payload posts (201)', async () => {
      const r = await post(A, A.admin, '/procurement/supplier-invoices', { supplierId: A.supplierId, invoiceNumber: `OK-${run}`, subtotal: 1234.5, post: true });
      expect(r.status).toBe(201);
      expect(r.body.data.total).toBe(1234.5);
    });
  });

  // ── S-F10 transfer double dispatch / receive ──────────────────────────
  describe('S-F10 transfer double dispatch / receive', () => {
    async function transfer() {
      const v = await variant(A, 'T10');
      expect((await post(A, A.admin, '/inventory/adjust', { variantId: v.id, quantity: 50, movementType: 'PURCHASE', unitCost: 10, clientRequestId: key('adj10') })).status).toBe(201);
      const t = await post(A, A.admin, '/inventory/transfers', { toBranchId: A.branch2Id, items: [{ variantId: v.id, requestedQty: 10 }] });
      expect(t.status).toBe(201);
      return { v, id: t.body.data.id as string };
    }
    const status = (id: string, s: string) =>
      request(app.getHttpServer()).put(`/api/v1/inventory/transfers/${id}/status`).set(hdr(A, A.admin)).send({ status: s });

    it('two concurrent dispatches deduct 10 once; the other is refused (409, or 400 if it read after the commit)', async () => {
      const { v, id } = await transfer();
      const [r1, r2] = await Promise.all([status(id, 'IN_TRANSIT'), status(id, 'IN_TRANSIT')]);
      const codes = [r1.status, r2.status].sort();
      expect(codes[0]).toBe(200);
      expect([400, 409]).toContain(codes[1]);
      expect(await onHand(A, v.id, A.branchId)).toBe(40);
      expect(await prisma.inventoryLog.count({ where: { tenantId: A.id, variantId: v.id, movementType: 'TRANSFER_OUT', NOT: { notes: 'LOT_ALLOCATION' } } })).toBe(1);
    });

    it('two concurrent receives add 10 once at the destination', async () => {
      const { v, id } = await transfer();
      expect((await status(id, 'IN_TRANSIT')).status).toBe(200);
      await pace();
      const [r1, r2] = await Promise.all([status(id, 'RECEIVED'), status(id, 'RECEIVED')]);
      const codes = [r1.status, r2.status].sort();
      expect(codes[0]).toBe(200);
      expect([400, 409]).toContain(codes[1]);
      expect(await onHand(A, v.id, A.branchId)).toBe(40);
      expect(await onHand(A, v.id, A.branch2Id)).toBe(10);
    });

    it('cancel and dispatch at the same moment: exactly one wins, stock matches the winner', async () => {
      const { v, id } = await transfer();
      await pace();
      const [d, c] = await Promise.all([status(id, 'IN_TRANSIT'), status(id, 'CANCELLED')]);
      const t = await prisma.stockTransfer.findUniqueOrThrow({ where: { id } });
      expect([d.status, c.status].filter((s) => s === 200)).toHaveLength(1);
      expect(await onHand(A, v.id, A.branchId)).toBe(t.status === 'IN_TRANSIT' ? 40 : 50);
    });

    it("A cannot change B's transfer status (404)", async () => {
      const vB = await variant(B, 'T10B');
      const t = await post(B, B.admin, '/inventory/transfers', { toBranchId: B.branch2Id, items: [{ variantId: vB.id, requestedQty: 1 }] });
      expect(t.status).toBe(201);
      expect((await put(A, A.admin, `/inventory/transfers/${t.body.data.id}/status`, { status: 'CANCELLED' })).status).toBe(404);
      expect((await prisma.stockTransfer.findUniqueOrThrow({ where: { id: t.body.data.id } })).status).toBe('PENDING');
    });
  });
});
