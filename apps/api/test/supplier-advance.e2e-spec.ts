/**
 * Supplier advance / overpayment kept on account: overpay, apply to later bills (partial, several bills), retries,
 * concurrent use, history, tenant isolation and the journals (Dr AP + Dr Supplier Advances / Cr Bank; Dr AP / Cr
 * Supplier Advances). Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountingPostingService } from '../src/modules/accounting/accounting-posting.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { waitForAccountingOutbox } from './helpers/accounting-drain';

jest.setTimeout(400_000);
const r2 = (n: number) => Math.round(n * 100) / 100;

type Shop = { id: string; sub: string; token: string; supplierId: string; bankId: string; variantId: string };

describe('Supplier advance (overpayment kept on account)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: AccountingPostingService;
  const PASSWORD = `Adv-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  let acct: NonNullable<Awaited<ReturnType<AccountingPostingService['resolveAccounts']>>>;
  let seq = 0;

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = (s: Shop) => ({ Authorization: `Bearer ${s.token}`, 'x-tenant-id': s.sub, Host: 'localhost' });
  const post = async (s: Shop, url: string, body: object) => { await pace(); return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s)).send(body); };
  const get = async (s: Shop, url: string) => { await pace(); return request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr(s)); };
  const key = (label: string) => `${label}-${run}-${++seq}`;

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `adv${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `ADV ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Admin', type: RoleType.TENANT_ADMIN, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const admin = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `admin-${run}@adv${label}.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'Admin', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: `Supplier ${label}`, phone: '0770000000' } });
    const bank = await prisma.bankAccount.create({ data: { tenantId: t.id, code: `BNK-${label}`, name: `Bank ${label}`, type: 'CURRENT' } });
    const p = await prisma.product.create({
      data: { tenantId: t.id, name: `Item ${label}`, slug: `item-${label}-${run}`, sku: `ITM-${label}-${run}`, sellingPrice: 100, costPrice: 60, mrp: 120, status: 'ACTIVE',
        variants: { create: { sku: `ITM-${label}-${run}-V`, name: 'Default', sellingPrice: 100, costPrice: 60, mrp: 120 } } },
      include: { variants: true },
    });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: admin.email, password: PASSWORD });
    if (login.status !== 200) throw new Error(`login ${login.status}`);
    await pace();
    return { id: t.id, sub, token: login.body.data.accessToken, supplierId: supplier.id, bankId: bank.id, variantId: p.variants[0].id };
  }

  /** A received PO: an open bill of qty x cost for this supplier. */
  async function bill(s: Shop, qty: number, cost: number) {
    const r = await post(s, '/purchases', {
      supplierId: s.supplierId, createAndReceive: true, clientRequestId: key('bill'),
      items: [{ variantId: s.variantId, productName: 'Item', variantName: 'Default', sku: 'x', orderedQty: qty, unitCost: cost }],
    });
    if (r.status !== 201) throw new Error(`bill ${r.status} ${JSON.stringify(r.body.message)}`);
    return r.body.data.id as string;
  }
  const pay = (s: Shop, body: object) => post(s, `/suppliers/${s.supplierId}/ap/payment`, { method: 'BANK_TRANSFER', bankAccountId: s.bankId, ...body });
  const apply = (s: Shop, body: object) => post(s, `/suppliers/${s.supplierId}/ap/advance/apply`, body);
  const sup = (s: Shop) => prisma.supplier.findFirstOrThrow({ where: { id: s.supplierId, tenantId: s.id }, select: { balance: true, advanceBalance: true } });
  const overview = async (s: Shop) => (await get(s, `/suppliers/${s.supplierId}/ap/advance`)).body.data;
  async function journal(s: Shop, referenceType: string, id: string) {
    for (let i = 0; i < 30; i++) {
      const je = await prisma.journalEntry.findFirst({ where: { tenantId: s.id, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
      if (je) return je;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error(`no journal ${referenceType}/${id}`);
  }
  const side = (je: { lines: { type: string; amount: number; debitAccountId: string | null; creditAccountId: string | null }[] }, type: 'DEBIT' | 'CREDIT', account: string) =>
    r2(je.lines.filter((l) => l.type === type && (type === 'DEBIT' ? l.debitAccountId : l.creditAccountId) === account).reduce((x, l) => x + l.amount, 0));
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
    posting = moduleFixture.get(AccountingPostingService);
    A = await seed('a');
    B = await seed('b');
    acct = (await posting.resolveAccounts(A.id))!;
  });

  afterAll(async () => {
    try {
      if (A && B) await waitForAccountingOutbox(app, prisma, [A.id, B.id]);
    } finally {
      await app?.close();
    }
  });

  let advancePaymentId = '';

  it('refuses a payment above the payable unless the user keeps the excess as advance', async () => {
    await bill(A, 10, 60); // 600
    await bill(A, 5, 100); // 500  -> payable 1,100
    expect((await sup(A)).balance).toBe(1100);
    const refused = await pay(A, { amount: 2000 });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/exceeds outstanding/);
    expect((await sup(A)).advanceBalance).toBe(0);
    expect(await prisma.supplierPayment.count({ where: { tenantId: A.id, supplierId: A.supplierId } })).toBe(0);
  });

  it('overpayment: pays the bills and keeps the excess as the supplier advance', async () => {
    const r = await pay(A, { amount: 2000, allowAdvance: true, notes: 'overpay' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ appliedTotal: 1100, advanceAmount: 900, advanceBalance: 900 });
    advancePaymentId = r.body.data.payment.id;
    expect(await sup(A)).toEqual({ balance: 0, advanceBalance: 900 });
    const pmt = await prisma.supplierPayment.findUniqueOrThrow({ where: { id: advancePaymentId } });
    expect(pmt).toMatchObject({ amount: 2000, advanceAmount: 900 });
    const entries = await prisma.supplierAdvanceEntry.findMany({ where: { tenantId: A.id, supplierId: A.supplierId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'ADVANCE_IN', amount: 900, balanceAfter: 900, paymentId: advancePaymentId });
    const ledger = await prisma.supplierLedgerEntry.findMany({ where: { tenantId: A.id, supplierId: A.supplierId, referenceId: advancePaymentId } });
    expect(ledger.map((l) => `${l.entryType}:${l.amount}`).sort()).toEqual(['ADJUSTMENT:0', 'PAYMENT:-1100']); // ADJUSTMENT: existing enum value, rollback-safe
    expect(ledger.find((l) => l.entryType === 'ADJUSTMENT')!.notes).toMatch(/Supplier advance: LKR 900.00 kept on account/);
  });

  it('the payable and the advance are shown separately', async () => {
    const o = await overview(A);
    expect(o).toMatchObject({ outstanding: 0, advanceBalance: 900, openBills: [] });
    expect(o.entries).toHaveLength(1);
    const list = await get(A, '/suppliers?limit=50');
    const row = (list.body.data.data ?? list.body.data).find((x: { id: string }) => x.id === A.supplierId);
    expect(row).toMatchObject({ balance: 0, advanceBalance: 900 });
  });

  it('journal of the overpayment: Dr Accounts Payable 1,100 + Dr Supplier Advances 900 / Cr bank 2,000', async () => {
    const je = await journal(A, 'SUPPLIER_PAYMENT', advancePaymentId);
    expect(side(je, 'DEBIT', acct.ap)).toBe(1100);
    expect(side(je, 'DEBIT', acct.supplierAdvance)).toBe(900);
    const credit = r2(je.lines.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0));
    expect(credit).toBe(2000);
  });

  it('apply the advance to a later bill: partially, then again to several bills', async () => {
    const po3 = await bill(A, 7, 100); // 700
    const po4 = await bill(A, 4, 100); // 400
    expect((await sup(A)).balance).toBe(1100);

    const first = await apply(A, { amount: 300, purchaseIds: [po3], clientRequestId: key('ap') });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ replayed: false, applied: 300, advanceBalance: 600, outstanding: 800 });
    expect(await sup(A)).toEqual({ balance: 800, advanceBalance: 600 });
    const po3Row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po3 } });
    expect(po3Row.paidAmount).toBe(300);

    const second = await apply(A, { allocations: [{ purchaseId: po3, amount: 250 }, { purchaseId: po4, amount: 100.5 }], clientRequestId: key('ap') });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ applied: 350.5, advanceBalance: 249.5, outstanding: 449.5 });
    expect(await sup(A)).toEqual({ balance: 449.5, advanceBalance: 249.5 });

    const history = await prisma.supplierAdvanceEntry.findMany({ where: { tenantId: A.id, supplierId: A.supplierId }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => `${h.type}:${h.amount}:${h.balanceAfter}`)).toEqual(['ADVANCE_IN:900:900', 'APPLIED:-300:600', 'APPLIED:-250:350', 'APPLIED:-100.5:249.5']);
    // one batch per request; the two rows of the second request share a batch
    expect(history[2].batchId).toBe(history[3].batchId);
    expect(history[1].batchId).not.toBe(history[2].batchId);
    const ledger = await prisma.supplierLedgerEntry.findMany({ where: { tenantId: A.id, supplierId: A.supplierId, referenceType: 'SupplierAdvance' }, orderBy: { createdAt: 'asc' } });
    expect(ledger.every((l) => l.entryType === 'ADJUSTMENT')).toBe(true);
    expect(ledger.map((l) => `${l.amount}:${l.balanceAfter}`)).toEqual(['-300:800', '-350.5:449.5']);
  });

  it('a retry with the same key applies nothing twice', async () => {
    const po = await bill(A, 1, 200); // 200 more payable
    const k = key('retry');
    const first = await apply(A, { amount: 100, purchaseIds: [po], clientRequestId: k });
    const again = await apply(A, { amount: 100, purchaseIds: [po], clientRequestId: k });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body.data).toMatchObject({ replayed: true, applied: 100, advanceBalance: 149.5 });
    expect(again.body.data.batchId).toBe(first.body.data.batchId);
    expect(await sup(A)).toEqual({ balance: 549.5, advanceBalance: 149.5 }); // 449.5 + 200 - 100
    expect(await prisma.supplierAdvanceEntry.count({ where: { tenantId: A.id, supplierId: A.supplierId, clientRequestId: k } })).toBe(1);
  });

  it('never above the available advance, never above what a bill owes, never an unknown bill', async () => {
    const before = await sup(A);
    expect((await apply(A, { amount: 500, clientRequestId: key('x') })).status).toBe(400);   // advance is 149.50
    const o = await overview(A);
    const bigBill = o.openBills.find((b: { due: number }) => b.due > 149.5) ?? o.openBills[0];
    expect((await apply(A, { allocations: [{ purchaseId: bigBill.id, amount: bigBill.due + 50 }], clientRequestId: key('x') })).status).toBe(400);
    expect((await apply(A, { allocations: [{ purchaseId: 'nope', amount: 1 }], clientRequestId: key('x') })).status).toBe(400);
    expect((await apply(A, { amount: 0, clientRequestId: key('x') })).status).toBe(400);
    expect((await apply(A, { amount: -5, clientRequestId: key('x') })).status).toBe(400);
    expect((await apply(A, { amount: 10.123, clientRequestId: key('x') })).status).toBe(400);
    expect(await sup(A)).toEqual(before);
  });

  it('two requests spending the same advance at the same time: only one wins, the balance never goes negative', async () => {
    const adv = (await sup(A)).advanceBalance; // 149.50
    await bill(A, 1, 1000);
    const body = (k: string) => ({ amount: 100, clientRequestId: k });
    const [x, y] = await Promise.all([apply(A, body(key('race'))), apply(A, body(key('race')))]);
    expect([x.status, y.status].sort()).toEqual([201, 400]);
    const after = await sup(A);
    expect(after.advanceBalance).toBe(r2(adv - 100));
    expect(after.advanceBalance).toBeGreaterThanOrEqual(0);
  });

  it('two retries of the SAME request at the same time apply once', async () => {
    const before = await sup(A); // advance 49.50
    const k = key('same');
    const [x, y] = await Promise.all([apply(A, { amount: 20, clientRequestId: k }), apply(A, { amount: 20, clientRequestId: k })]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(x.body.data.batchId).toBe(y.body.data.batchId);
    expect((await sup(A)).advanceBalance).toBe(r2(before.advanceBalance - 20));
  });

  it('journal of an application: Dr Accounts Payable / Cr Supplier Advances, no cash or bank', async () => {
    const batch = await prisma.supplierAdvanceEntry.findFirstOrThrow({ where: { tenantId: A.id, supplierId: A.supplierId, type: 'APPLIED' }, orderBy: { createdAt: 'asc' } });
    const rows = await prisma.supplierAdvanceEntry.findMany({ where: { tenantId: A.id, batchId: batch.batchId } });
    const total = r2(rows.reduce((s, r) => s + Math.abs(r.amount), 0));
    const je = await journal(A, 'SUPPLIER_ADVANCE_APPLIED', batch.batchId);
    expect(je.lines).toHaveLength(2);
    expect(side(je, 'DEBIT', acct.ap)).toBe(total);
    expect(side(je, 'CREDIT', acct.supplierAdvance)).toBe(total);
  });

  it('the ledger agrees with the supplier: 1250 Supplier Advances = advance balance, 2100 AP = payable', async () => {
    await waitForAccountingOutbox(app, prisma, [A.id]);
    const lines = await prisma.journalLine.findMany({ where: { journalEntry: { tenantId: A.id, status: { not: 'VOID' } } } });
    const net = (account: string, normal: 'DEBIT' | 'CREDIT') =>
      r2(lines.reduce((s, l) => s + (l.debitAccountId === account ? (normal === 'DEBIT' ? l.amount : -l.amount) : 0) + (l.creditAccountId === account ? (normal === 'CREDIT' ? l.amount : -l.amount) : 0), 0));
    const s = await sup(A);
    expect(net(acct.supplierAdvance, 'DEBIT')).toBe(s.advanceBalance);
    expect(net(acct.ap, 'CREDIT')).toBe(s.balance);
  });

  it('a payment with nothing payable can be kept entirely as advance', async () => {
    // pay everything off first (no advance requested), then overpay a clean supplier
    const o = await overview(A);
    if (o.outstanding > 0) expect((await pay(A, { amount: o.outstanding })).status).toBe(201);
    const before = await sup(A);
    const r = await pay(A, { amount: 250.25, allowAdvance: true });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ appliedTotal: 0, advanceAmount: 250.25 });
    expect((await sup(A)).advanceBalance).toBe(r2(before.advanceBalance + 250.25));
  });

  it('shops are isolated: another shop cannot see or use this supplier advance', async () => {
    const own = await overview(A);
    expect(own.advanceBalance).toBeGreaterThan(0);
    const wrongShopView = await request(app.getHttpServer()).get(`/api/v1/suppliers/${A.supplierId}/ap/advance`).set(hdr(B));
    expect(wrongShopView.status).toBe(404);
    const wrongShopApply = await request(app.getHttpServer()).post(`/api/v1/suppliers/${A.supplierId}/ap/advance/apply`).set(hdr(B)).send({ amount: 1, clientRequestId: key('iso') });
    expect(wrongShopApply.status).toBe(404);
    expect((await sup(B)).advanceBalance).toBe(0);
  });

  it('existing flows are unchanged: a normal partial payment and a payment of exactly the payable create no advance', async () => {
    const po = await bill(B, 10, 100); // 1,000
    const partial = await pay(B, { amount: 400, purchaseIds: [po] });
    expect(partial.status).toBe(201);
    expect(partial.body.data.advanceAmount).toBe(0);
    const exact = await pay(B, { amount: 600, purchaseIds: [po] });
    expect(exact.status).toBe(201);
    expect(await sup(B)).toEqual({ balance: 0, advanceBalance: 0 });
    const over = await pay(B, { amount: 10, purchaseIds: [po] });
    expect(over.status).toBe(400);
  });
});
