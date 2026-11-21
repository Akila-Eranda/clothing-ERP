/**
 * WRITTEN BUT NOT RUN (no test database is configured in this environment).
 * Needs DATABASE_URL (a TEST database) + Redis. Covers: stock-adjust clientRequestId (replay / conflict /
 * concurrent), partial-PO double receive, duplicate GRN clientRequestId, GRN MRP check, lot linking per batch.
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

describe('stock adjust idempotency, GRN MRP, lot linking, partial PO', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const PASSWORD = `SIM-${Date.now()}-pw!`;
  let S: { id: string; sub: string; branchId: string; supplierId: string; admin: string };
  let seq = 0;
  const hdr = () => ({ Authorization: `Bearer ${S.admin}`, 'x-tenant-id': S.sub, Host: 'localhost' });
  const post = (url: string, body: object) => request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr()).send(body);

  async function newVariant(label: string) {
    const p = await prisma.product.create({
      data: {
        tenantId: S.id, name: `${label} ${run}`, slug: `${label.toLowerCase()}-${run}-${++seq}`, sku: `${label}-${run}-${seq}`,
        sellingPrice: 100, costPrice: 60, mrp: 120, status: 'ACTIVE',
        variants: { create: { sku: `${label}-${run}-${seq}-V`, name: 'Default', sellingPrice: 100, costPrice: 60, mrp: 120 } },
      },
      include: { variants: true },
    });
    return p.variants[0];
  }
  const onHand = async (variantId: string) =>
    (await prisma.inventory.aggregate({ where: { tenantId: S.id, variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;

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
    const sub = `sim${run}`;
    const t = await prisma.tenant.create({ data: { name: 'SIM', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: 'WH-SIM', isDefault: true } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const admin = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `admin-${run}@sim.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'A', lastName: 'S', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: 'Supplier SIM', phone: '0770000000' } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: admin.email, password: PASSWORD });
    S = { id: t.id, sub, branchId: branch.id, supplierId: supplier.id, admin: login.body.data.accessToken };
  });
  afterAll(async () => {
    try {
      if (S?.id) await waitForAccountingOutbox(app, prisma, [S.id]);
    } finally {
      await app?.close();
    }
  });

  it('stock adjust: same clientRequestId twice changes stock once', async () => {
    const v = await newVariant('ADJ');
    const body = { variantId: v.id, quantity: 5, movementType: 'PURCHASE', clientRequestId: `adj-${run}-1` };
    expect((await post('/inventory/adjust', body)).status).toBe(201);
    expect((await post('/inventory/adjust', body)).status).toBe(201);
    expect(await onHand(v.id)).toBe(5);
  });

  it('stock adjust: same key, different payload -> 409', async () => {
    const v = await newVariant('ADJC');
    await post('/inventory/adjust', { variantId: v.id, quantity: 5, movementType: 'PURCHASE', clientRequestId: `adjc-${run}-1` });
    const r = await post('/inventory/adjust', { variantId: v.id, quantity: 9, movementType: 'PURCHASE', clientRequestId: `adjc-${run}-1` });
    expect(r.status).toBe(409);
    expect(await onHand(v.id)).toBe(5);
  });

  it('stock adjust: concurrent same key (no inventory row yet) adds once', async () => {
    const v = await newVariant('ADJP');
    const body = { variantId: v.id, quantity: 4, movementType: 'PURCHASE', clientRequestId: `adjp-${run}-1` };
    const [a, b] = await Promise.all([post('/inventory/adjust', body), post('/inventory/adjust', body)]);
    expect([a.status, b.status].every((s) => s === 201)).toBe(true);
    expect(await onHand(v.id)).toBe(4);
  });

  it('partial PO: receiving 4 then 6 fills it; a further receive is refused', async () => {
    const v = await newVariant('PART');
    const r = await post('/purchases', { supplierId: S.supplierId, items: [{ variantId: v.id, productName: 'x', variantName: 'Default', sku: 'x', orderedQty: 10, unitCost: 60 }] });
    await prisma.purchaseOrder.update({ where: { id: r.body.data.id }, data: { status: PurchaseOrderStatus.CONFIRMED } });
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: r.body.data.id }, include: { items: true } });
    const itemId = po.items[0].id;
    expect((await post(`/purchases/${po.id}/receive`, { items: [{ itemId, receivedQty: 4 }], clientRequestId: `part-${run}-1` })).status).toBe(201);
    expect((await post(`/purchases/${po.id}/receive`, { items: [{ itemId, receivedQty: 6 }], clientRequestId: `part-${run}-2` })).status).toBe(201);
    expect((await post(`/purchases/${po.id}/receive`, { items: [{ itemId, receivedQty: 1 }], clientRequestId: `part-${run}-3` })).status).toBe(400);
    expect(await onHand(v.id)).toBe(10);
  });

  it('GRN: duplicate clientRequestId replays, selling price above MRP only warns, lots link per batch', async () => {
    const v = await newVariant('GRN');
    const line = (batchNumber: string, receivedQty: number, extra: object = {}) => ({ variantId: v.id, productName: 'p', variantName: 'Default', sku: 's', receivedQty, unitCost: 60, batchNumber, ...extra });
    const bad = await post('/procurement/grn/direct', { supplierId: S.supplierId, lines: [line('Z', 1, { sellingPrice: 150, mrp: 120 })], clientRequestId: `grn-${run}-bad` });
    // Selling above MRP is a warning only: the stock IS received and the response carries warnings.
    expect(bad.status).toBe(201);
    expect((bad.body.data.warnings ?? [])[0]).toMatchObject({ lineIndex: 0, sellingPrice: 150, mrp: 120 });
    expect(await onHand(v.id)).toBe(1);
    const body = { supplierId: S.supplierId, lines: [line('A', 5, { sellingPrice: 100, mrp: 120 }), line('B', 7)], clientRequestId: `grn-${run}-ok` };
    const first = await post('/procurement/grn/direct', body);
    const second = await post('/procurement/grn/direct', body);
    expect(first.status).toBe(201);
    expect(second.body.data.id ?? second.body.data.grn?.id).toBe(first.body.data.id ?? first.body.data.grn?.id);
    expect(await onHand(v.id)).toBe(13);
    const items = await prisma.goodsReceiptItem.findMany({ where: { variantId: v.id, grn: { tenantId: S.id } }, orderBy: { receivedQty: 'asc' } });
    const lots = await Promise.all(items.map((i) => prisma.inventoryLot.findUniqueOrThrow({ where: { id: i.lotId! } })));
    expect(lots.map((l) => [l.batchNumber, l.quantity])).toEqual([['Z', 1], ['A', 5], ['B', 7]]);
  });
});

// Written, not run: applyAdvance idempotency (same key + same payload replays; different payload -> 409) should be
// exercised through POST /suppliers/:id/advance/apply once a test database exists.
