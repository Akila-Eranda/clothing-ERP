/**
 * PO / GRN stock synchronisation: every receipt updates branch/warehouse stock, product stock and the
 * stock ledger exactly once — also on client retries, double submits and concurrent receipts — and
 * purchasing sees exact (negative) stock. Over HTTP on the full AppModule against PostgreSQL + Redis.
 * Needs DATABASE_URL (a TEST database) and REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
 *
 * REPRO=1 runs the retry cases WITHOUT idempotency keys, to show the behaviour of code that has none.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { PurchaseOrderStatus, RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { waitForAccountingOutbox } from './helpers/accounting-drain';

jest.setTimeout(300_000);
const REPRO = !!process.env.REPRO;

describe('PO / GRN stock synchronisation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `PGS-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let S: { id: string; sub: string; branchId: string; whId: string; supplierId: string; admin: string };
  let seq = 0;

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = () => ({ Authorization: `Bearer ${S.admin}`, 'x-tenant-id': S.sub, Host: 'localhost' });
  const post = (url: string, body: object) => request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr()).send(body);
  const get = (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr());
  const key = (label: string) => (REPRO ? {} : { clientRequestId: `${label}-${run}-${++seq}` });

  async function newVariant(label: string, onHand = 0) {
    const p = await prisma.product.create({
      data: {
        tenantId: S.id, name: `${label} ${run}`, slug: `${label.toLowerCase()}-${run}-${++seq}`, sku: `${label}-${run}-${seq}`,
        sellingPrice: 100, costPrice: 60, mrp: 120, status: 'ACTIVE',
        variants: { create: { sku: `${label}-${run}-${seq}-V`, name: 'Default', sellingPrice: 100, costPrice: 60, mrp: 120 } },
      },
      include: { variants: true },
    });
    const v = p.variants[0];
    if (onHand !== 0) await prisma.inventory.create({ data: { tenantId: S.id, branchId: S.branchId, warehouseId: S.whId, variantId: v.id, quantity: onHand } });
    return v;
  }
  const onHand = async (variantId: string) =>
    (await prisma.inventory.aggregate({ where: { tenantId: S.id, variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const ledger = async (variantId: string) =>
    (await prisma.inventoryLog.aggregate({ where: { tenantId: S.id, variantId, NOT: { notes: 'LOT_ALLOCATION' } }, _sum: { quantityChange: true } }))._sum.quantityChange ?? 0;
  const grnCount = (variantId: string) => prisma.goodsReceiptItem.count({ where: { variantId, grn: { tenantId: S.id } } });

  async function confirmedPo(
    variantId: string,
    qty: number,
    options: { freeQty?: number; unitCost?: number; supplierId?: string } = {},
  ) {
    const r = await post('/purchases', {
      supplierId: options.supplierId ?? S.supplierId,
      items: [{
        variantId, productName: 'x', variantName: 'Default', sku: 'x', orderedQty: qty,
        ...(options.freeQty != null ? { freeQty: options.freeQty } : {}),
        unitCost: options.unitCost ?? 60,
      }],
    });
    expect(r.status).toBe(201);
    await prisma.purchaseOrder.update({ where: { id: r.body.data.id }, data: { status: PurchaseOrderStatus.CONFIRMED } });
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { items: true } });
    return { id: po.id, itemId: po.items[0].id };
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

    const sub = `pgs${run}`;
    const t = await prisma.tenant.create({ data: { name: 'PGS', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: 'WH-PGS', isDefault: true } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const admin = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `admin-${run}@pgs.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'Admin', lastName: 'PGS', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: 'Supplier PGS', phone: '0770000000' } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: admin.email, password: PASSWORD });
    if (login.status !== 200) throw new Error(`login ${login.status}`);
    S = { id: t.id, sub, branchId: branch.id, whId: wh.id, supplierId: supplier.id, admin: login.body.data.accessToken };
  });

  afterAll(async () => {
    try {
      if (S?.id) await waitForAccountingOutbox(app, prisma, [S.id]);
    } finally {
      await app?.close();
    }
  });

  it('a GRN updates branch/warehouse stock, product stock and the ledger at once', async () => {
    const v = await newVariant('SYNC', 3);
    const po = await confirmedPo(v.id, 10);
    const r = await post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 4, batchNumber: 'B1' }], ...key('sync') });
    expect(r.status).toBe(201);
    expect(await onHand(v.id)).toBe(7);
    const row = await prisma.inventory.findFirstOrThrow({ where: { tenantId: S.id, variantId: v.id } });
    expect(row).toMatchObject({ branchId: S.branchId, warehouseId: S.whId, quantity: 7 });
    expect(await ledger(v.id)).toBe(4); // opening 3 was seeded directly, the GRN logged +4
    const posRow = (await get('/pos/products?limit=2000')).body.data;
    const list = Array.isArray(posRow) ? posRow : posRow.items ?? posRow.data;
    expect(list.find((x: { variantId: string }) => x.variantId === v.id)).toMatchObject({ currentStock: 7, stock: 7 });
    const poAfter = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: po.itemId } });
    expect(poAfter.receivedQty).toBe(4);
  });

  it('two concurrent receipts of the same PO line add the stock once', async () => {
    const v = await newVariant('CONC');
    const po = await confirmedPo(v.id, 10);
    const [a, b] = await Promise.all([
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 10 }], ...key('conc-a') }),
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 10 }], ...key('conc-b') }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await onHand(v.id)).toBe(10);
    expect(await ledger(v.id)).toBe(10);
    expect(await grnCount(v.id)).toBe(1);
    const item = await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: po.itemId } });
    expect(item.receivedQty).toBe(10);
  });

  it('uses the locked PO balance to allocate concurrent partial receipts with free units', async () => {
    const v = await newVariant('CONCOST');
    const po = await confirmedPo(v.id, 10, { freeQty: 2, unitCost: 120 });

    const [a, b] = await Promise.all([
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 6 }], ...key('cost-a') }),
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 6 }], ...key('cost-b') }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const grnIds = [a.body.data.grn.id, b.body.data.grn.id];
    const grnItems = [a.body.data.grn.items[0], b.body.data.grn.items[0]];
    expect(grnItems.map((item) => item.unitCost).sort((x, y) => x - y)).toEqual([80, 120]);

    const payableRows = await prisma.supplierLedgerEntry.findMany({
      where: { tenantId: S.id, referenceType: 'GoodsReceipt', referenceId: { in: grnIds } },
      select: { amount: true },
    });
    expect(payableRows.map((row) => row.amount).sort((x, y) => x - y)).toEqual([480, 720]);

    const inventory = await prisma.inventory.findFirstOrThrow({ where: { tenantId: S.id, variantId: v.id } });
    expect(inventory).toMatchObject({ quantity: 12, avgCost: 100 });
    expect((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: po.itemId } })).receivedQty).toBe(12);
  });

  it('rechecks the supplier credit limit against the fresh payable under the PO lock', async () => {
    const v = await newVariant('CREDIT');
    const supplier = await prisma.supplier.create({
      data: {
        tenantId: S.id,
        name: `Credit limit ${run}`,
        phone: `077${String(Date.now()).slice(-7)}`,
        creditLimit: 1199,
      },
    });
    const po = await confirmedPo(v.id, 10, {
      freeQty: 2,
      unitCost: 120,
      supplierId: supplier.id,
    });

    const [a, b] = await Promise.all([
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 6 }], ...key('credit-a') }),
      post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 6 }], ...key('credit-b') }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const accepted = a.status === 201 ? a : b;
    expect(accepted.body.data.grn.items[0]).toMatchObject({ receivedQty: 6, unitCost: 120 });
    expect(await onHand(v.id)).toBe(6);
    expect(await grnCount(v.id)).toBe(1);
    expect((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: po.itemId } })).receivedQty).toBe(6);
  });

  it('a retried partial receipt (same request) does not add stock twice', async () => {
    const v = await newVariant('RETRY');
    const po = await confirmedPo(v.id, 10);
    const body = { items: [{ itemId: po.itemId, receivedQty: 4 }], ...key('retry') };
    const first = await post(`/purchases/${po.id}/receive`, body);
    await pace();
    const second = await post(`/purchases/${po.id}/receive`, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.grn.id).toBe(first.body.data.grn.id);
    expect(await onHand(v.id)).toBe(4);
    expect(await grnCount(v.id)).toBe(1);
    expect((await prisma.purchaseOrderItem.findUniqueOrThrow({ where: { id: po.itemId } })).receivedQty).toBe(4);
  });

  it('a double-submitted Quick GRN (same request, in parallel) posts once', async () => {
    const v = await newVariant('QUICK');
    const body = { supplierId: S.supplierId, lines: [{ variantId: v.id, quantity: 6, unitCost: 50 }], ...key('quick') };
    const [a, b] = await Promise.all([post('/procurement/grn/quick', body), post('/procurement/grn/quick', body)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await onHand(v.id)).toBe(6);
    expect(await grnCount(v.id)).toBe(1);
  });

  it('a retried "Create PO + GRN" creates one PO and receives once', async () => {
    const v = await newVariant('POGRN', 2);
    const openingInventory = await prisma.inventory.findFirstOrThrow({ where: { tenantId: S.id, variantId: v.id } });
    await prisma.inventory.update({ where: { id: openingInventory.id }, data: { avgCost: 30 } });
    const body = {
      supplierId: S.supplierId, createAndReceive: true,
      items: [{ variantId: v.id, productName: 'x', variantName: 'Default', sku: 'x', orderedQty: 5, freeQty: 1, unitCost: 60 }],
      ...key('pogrn'),
    };
    const first = await post('/purchases', body);
    await pace();
    const second = await post('/purchases', body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.purchaseOrderItem.count({ where: { variantId: v.id } })).toBe(1);
    expect(await onHand(v.id)).toBe(8);
    expect(await grnCount(v.id)).toBe(1);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { tenantId: S.id, variantId: v.id } });
    expect(inventory.avgCost).toBe(45);
    const grnItem = await prisma.goodsReceiptItem.findFirstOrThrow({ where: { variantId: v.id, grn: { tenantId: S.id } } });
    expect(grnItem).toMatchObject({ receivedQty: 6, unitCost: 50 });
  });

  it('a supplier return posted twice at the same time removes stock once', async () => {
    const v = await newVariant('SRET', 20);
    const created = await post('/procurement/supplier-returns', {
      supplierId: S.supplierId, items: [{ variantId: v.id, productName: 'x', sku: 'x', quantity: 3, unitCost: 60 }],
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    const [a, b] = await Promise.all([post(`/procurement/supplier-returns/${id}/post`, {}), post(`/procurement/supplier-returns/${id}/post`, {})]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await onHand(v.id)).toBe(17);
  });

  it('purchasing sees exact negative stock (−2), not 0', async () => {
    const v = await newVariant('NEG', -2);
    await prisma.supplierProductAssignment.create({ data: { tenantId: S.id, supplierId: S.supplierId, variantId: v.id, isActive: true } });
    const res = await get(`/pos/products?supplierId=${S.supplierId}&limit=2000`);
    const list = Array.isArray(res.body.data) ? res.body.data : res.body.data.items ?? res.body.data.data;
    const row = list.find((x: { variantId: string }) => x.variantId === v.id);
    expect(row.currentStock).toBe(-2); // exact figure is available to the PO screen
    expect(row.stock).toBe(0);          // the selling figure stays clamped (POS behaviour unchanged)
    // receiving 5 on top of −2 gives 3 everywhere
    const po = await confirmedPo(v.id, 5);
    expect((await post(`/purchases/${po.id}/receive`, { items: [{ itemId: po.itemId, receivedQty: 5 }], ...key('neg') })).status).toBe(201);
    expect(await onHand(v.id)).toBe(3);
  });
});
