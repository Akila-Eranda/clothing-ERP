/**
 * QR payment fee, Option A (confirmed 12 Nov): the fee is DEDUCTED from the QR payment by the bank.
 * The customer pays the invoice amount (gross); the business receives gross − fee (net). The fee is only taken when
 * a QR tender is ABOVE the threshold, is stored with the payment (gross, %, fee, net), is applied exactly once
 * (retries, parallel submits), settings changes never touch past sales, journals book the fee as a bank / payment
 * charge EXPENSE (never income, never more revenue), and goods refunds never reverse it.
 * Full AppModule over HTTP against PostgreSQL + Redis (TEST database).
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

jest.setTimeout(400_000);
const r2 = (n: number) => Math.round(n * 100) / 100;
const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read'];
type Je = { id: string; lines: { type: string; amount: number; debitAccountId: string | null; creditAccountId: string | null }[] };

let __retSeq = 0;
const rid = () => `e2e-ret-${Date.now().toString(36)}-${(__retSeq++).toString(36)}`;

describe('QR payment fee (Option A: deducted from the QR payment)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: AccountingPostingService;
  const PASSWORD = `Qrf-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let sub = '';
  let subB = '';
  let tenantId = '';
  let counterId = '';
  let variantId = '';
  let bankId = '';
  let bankGlAccountId = '';
  let transferBankId = '';
  let customerId = '';
  let creditCustomerId = ''; // zero wallet, credit limit: the unpaid remainder must become customer credit
  let admin = '';
  let adminB = '';
  let cashier = '';
  let acct: NonNullable<Awaited<ReturnType<AccountingPostingService['resolveAccounts']>>>;
  let seq = 0;
  const saleIds: string[] = [];
  const returnIds: string[] = [];

  const pace = () => new Promise((r) => setTimeout(r, 250));
  const hdr = (token: string, s = sub) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s, Host: 'localhost', ...(s === sub ? { 'x-pos-counter-id': counterId } : {}) });
  const post = async (token: string, url: string, body: unknown) => { await pace(); return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(token)).send(body as object); };
  const put = async (token: string, url: string, body: unknown) => { await pace(); return request(app.getHttpServer()).put(`/api/v1${url}`).set(hdr(token)).send(body as object); };
  const get = async (token: string, url: string, s = sub) => { await pace(); return request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr(token, s)); };
  const key = () => `qrf-${run}-${++seq}`;

  /** A bill of `total` LKR (custom item, so any amount works). */
  const custom = (total: number) => [{ isCustom: true, productName: `Bill ${total}`, variantName: '', sku: 'CUSTOM', quantity: 1, unitPrice: total, costPrice: 1 }];
  const qr = (amount: number, extra: object = {}) => ({ method: 'QR', amount, bankAccountId: bankId, ...extra });
  const sell = async (items: object[], payments: object[], extra: object = {}) => {
    const r = await post(admin, '/pos/sale', { items, payments, applyTierDiscount: false, ...extra });
    if (r.status === 201 && r.body?.data?.id && !saleIds.includes(r.body.data.id)) saleIds.push(r.body.data.id);
    return r;
  };
  const paymentRows = (saleId: string) => prisma.salePayment.findMany({ where: { saleId }, orderBy: { id: 'asc' } });
  const setFee = (threshold: number, percent: number) => put(admin, '/tenants/pos-settings', { qrFeeThreshold: threshold, qrFeePercent: percent });
  async function journal(referenceType: string, id: string): Promise<Je> {
    for (let i = 0; i < 40; i++) {
      const je = await prisma.journalEntry.findFirst({ where: { tenantId, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
      if (je) return je;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error(`no journal ${referenceType}/${id}`);
  }
  const side = (je: Je, type: 'DEBIT' | 'CREDIT', account?: string) =>
    r2(je.lines.filter((l) => l.type === type && (!account || (type === 'DEBIT' ? l.debitAccountId : l.creditAccountId) === account)).reduce((x, l) => x + l.amount, 0));
  /** Revenue credited by a sale journal (everything credited except the bank fee pair and inventory). */
  const revenue = (je: Je) => r2(je.lines.filter((l) => l.type === 'CREDIT' && l.creditAccountId && acct.sales === l.creditAccountId).reduce((x, l) => x + l.amount, 0));

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

    const hash = await bcrypt.hash(PASSWORD, 10);
    const role = async (tid: string, name: string, type: RoleType, keys: readonly string[]) => {
      const ps = await Promise.all(keys.map((k) => {
        const [resource, action] = k.split(':');
        return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
      }));
      return prisma.role.create({ data: { tenantId: tid, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const sign = async (email: string, s: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': s, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };

    sub = `qrf${run}`;
    const t = await prisma.tenant.create({ data: { name: 'QRF shop', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    tenantId = t.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId, branchId: branch.id, name: 'Main', code: 'WH-QRF', isDefault: true } });
    counterId = (await prisma.posCounter.create({ data: { tenantId, branchId: branch.id, name: 'Counter 1', code: 'C1' } })).id;
    const adminRole = await role(tenantId, 'Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const cashierRole = await role(tenantId, 'Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const mk = (tid: string, bid: string, who: string, roleId: string) => prisma.user.create({
      data: { tenantId: tid, branchId: bid, email: `${who}-${run}@qrf.test`, passwordHash: hash, firstName: who, lastName: 'Q', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    admin = await sign((await mk(tenantId, branch.id, 'admin', adminRole.id)).email, sub);
    cashier = await sign((await mk(tenantId, branch.id, 'cashier', cashierRole.id)).email, sub);

    // A second shop: its QR fee settings must never be affected by this shop's.
    subB = `qrfb${run}`;
    const tB = await prisma.tenant.create({ data: { name: 'QRF shop B', subdomain: subB, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branchB = await prisma.branch.create({ data: { tenantId: tB.id, name: 'Main', code: 'MAIN' } });
    adminB = await sign((await mk(tB.id, branchB.id, 'adminb', (await role(tB.id, 'Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE)).id)).email, subB);

    const product = await prisma.product.create({
      data: { tenantId, name: 'Rice', slug: `rice-${run}`, sku: `RICE-${run}`, sellingPrice: 200, costPrice: 120, mrp: 250, status: 'ACTIVE', variants: { create: { sku: `RICE-${run}-V`, name: 'Default', sellingPrice: 200, costPrice: 120, mrp: 250 } } },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
    await prisma.inventory.create({ data: { tenantId, branchId: branch.id, warehouseId: wh.id, variantId, quantity: 10000 } });
    acct = (await posting.resolveAccounts(tenantId))!;
    const gl = await prisma.account.create({ data: { tenantId, code: `1298${run.slice(-3)}`, name: 'QR bank', type: 'ASSET' } });
    bankGlAccountId = gl.id;
    bankId = (await prisma.bankAccount.create({ data: { tenantId, code: 'BNK-Q', name: 'QR bank', glAccountId: gl.id } })).id;
    const gl2 = await prisma.account.create({ data: { tenantId, code: `1297${run.slice(-3)}`, name: 'Transfer bank', type: 'ASSET' } });
    transferBankId = (await prisma.bankAccount.create({ data: { tenantId, code: 'BNK-T', name: 'Transfer bank', glAccountId: gl2.id } })).id;
    customerId = (await prisma.customer.create({ data: { tenantId, firstName: 'Nimal', phone: `07${run.slice(-8)}`, walletBalance: 20000, creditLimit: 100000 } })).id;
    creditCustomerId = (await prisma.customer.create({ data: { tenantId, firstName: 'Kamal', phone: `07${run.slice(-8).split('').reverse().join('')}`, walletBalance: 0, creditLimit: 100000 } })).id;
    expect((await post(admin, '/cash/open', { openingCash: 20000, counterId })).status).toBe(201);
  });

  afterAll(async () => {
    for (let i = 0; i < 60; i++) {
      const busy = await prisma.accountingOutboxEvent.count({ where: { tenantId, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (!busy) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    await new Promise((res) => setTimeout(res, 1500));
    await app?.close();
  });

  it('defaults: LKR 5,000 threshold and 1 %; the fee is booked to an EXPENSE account (5620), never income', async () => {
    const r = await get(admin, '/tenants/pos-settings');
    expect(r.body.data).toMatchObject({ qrFeeThreshold: 5000, qrFeePercent: 1, defaultQrFeeThreshold: 5000, defaultQrFeePercent: 1 });
    const charges = await prisma.account.findUnique({ where: { id: acct.paymentCharges } });
    expect(charges).toMatchObject({ code: '5620', type: 'EXPENSE' });
    expect(await prisma.account.count({ where: { tenantId, code: '4050' } })).toBe(0); // no QR fee income account
  });

  it('threshold boundary: below and EXACTLY at the threshold no fee; above it the fee is on the whole gross amount', async () => {
    const below = await sell(custom(4999), [qr(4999)]);
    expect(below.status).toBe(201);
    expect((await paymentRows(below.body.data.id))[0]).toMatchObject({ method: 'QR', amount: 4999, feePercent: 0, feeAmount: 0, netAmount: 4999 });
    const equal = await sell(custom(5000), [qr(5000, { expectedQrFee: 0 })]);
    expect(equal.status).toBe(201);
    expect((await paymentRows(equal.body.data.id))[0]).toMatchObject({ amount: 5000, feePercent: 0, feeAmount: 0, netAmount: 5000 });
    const above = await sell(custom(5001), [qr(5001)]);
    expect(above.status).toBe(201);
    expect((await paymentRows(above.body.data.id))[0]).toMatchObject({ amount: 5001, feePercent: 1, feeAmount: 50.01, netAmount: 4950.99 });
  });

  it('gross / net: QR 6,000 at 1 % → fee 60, net 5,940; the invoice total and amount paid stay 6,000', async () => {
    const r = await sell(custom(6000), [qr(6000, { expectedQrFee: 60 })]);
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ total: 6000, amountPaid: 6000, changeDue: 0 });
    expect((await paymentRows(r.body.data.id))[0]).toMatchObject({ amount: 6000, feePercent: 1, feeAmount: 60, netAmount: 5940 });
    const sale = await prisma.sale.findUnique({ where: { id: r.body.data.id } });
    expect(sale).toMatchObject({ total: 6000, amountPaid: 6000, paymentStatus: 'COMPLETED' });
  });

  it('refuses the sale (409, nothing saved) when the fee shown on screen is not the server fee', async () => {
    const before = await prisma.sale.count({ where: { tenantId } });
    const r = await sell(custom(10000), [qr(10000, { expectedQrFee: 50 })]);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/QR fee changed/);
    expect(await prisma.sale.count({ where: { tenantId } })).toBe(before);
  });

  it('cash, card, bank transfer, wallet and customer credit never have a QR fee, whatever the amount', async () => {
    const cases: [string, object, object][] = [
      ['CASH', { method: 'CASH', amount: 9000 }, {}],
      ['CARD', { method: 'CARD', amount: 9000, cardLast4: '4242' }, {}],
      ['BANK_TRANSFER', { method: 'BANK_TRANSFER', amount: 9000, bankAccountId: transferBankId }, {}],
      ['WALLET', { method: 'WALLET', amount: 9000 }, { customerId }],
      ['CUSTOMER_CREDIT', { method: 'CUSTOMER_CREDIT', amount: 9000 }, { customerId }],
    ];
    for (const [method, pay, extra] of cases) {
      const r = await sell(custom(9000), [pay], extra);
      expect([method, r.status]).toEqual([method, 201]);
      const [p] = await paymentRows(r.body.data.id);
      expect([method, p.feePercent, p.feeAmount, p.netAmount]).toEqual([method, null, null, null]);
      const je = await journal('SALE', r.body.data.id);
      expect([method, side(je, 'DEBIT', acct.paymentCharges)]).toEqual([method, 0]);
    }
  });

  it('several QR tenders: the fee is worked out per QR tender; other tenders in the same sale have none', async () => {
    const r = await sell(custom(19000), [qr(6000), qr(3000), qr(6000), { method: 'CASH', amount: 4000 }]);
    expect(r.status).toBe(201);
    expect(r.body.data.total).toBe(19000);
    const rows = await paymentRows(r.body.data.id);
    const qrRows = rows.filter((p) => p.method === 'QR').map((p) => [p.amount, p.feeAmount, p.netAmount]).sort((a, b) => Number(b[1]) - Number(a[1]) || Number(a[0]) - Number(b[0]));
    expect(qrRows).toEqual([[6000, 60, 5940], [6000, 60, 5940], [3000, 0, 3000]]);
    expect(rows.find((p) => p.method === 'CASH')!.feeAmount).toBeNull();
    const je = await journal('SALE', r.body.data.id);
    expect(side(je, 'DEBIT', acct.paymentCharges)).toBe(120);
    expect(r2(side(je, 'DEBIT', bankGlAccountId) - side(je, 'CREDIT', bankGlAccountId))).toBe(14880); // 15,000 gross − 120
    expect(revenue(je)).toBe(19000);
    expect(side(je, 'DEBIT')).toBe(side(je, 'CREDIT'));
  });

  it('partial payment: the fee is on the QR tender only; the unpaid balance goes to customer credit at full value', async () => {
    const beforeCust = (await prisma.customer.findUnique({ where: { id: creditCustomerId } }))!;
    const before = beforeCust.creditBalance;
    // The shortfall must be an explicit Customer Credit tender: a QR payment short of the bill is refused.
    const short = await sell(custom(10000), [qr(7000, { expectedQrFee: 70 })], { customerId: creditCustomerId, allowPartialPayment: true });
    expect(short.status).toBe(400);
    expect(String(short.body.message)).toMatch(/select Customer Credit for the unpaid amount/);
    const r = await sell(custom(10000), [qr(7000, { expectedQrFee: 70 }), { method: 'CUSTOMER_CREDIT', amount: 3000 }], { customerId: creditCustomerId });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ total: 10000 });
    expect((await paymentRows(r.body.data.id)).find((p) => p.method === 'QR')).toMatchObject({ amount: 7000, feeAmount: 70, netAmount: 6930 });
    const afterCust = (await prisma.customer.findUnique({ where: { id: creditCustomerId } }))!;
    expect(r2(afterCust.creditBalance - before)).toBe(3000); // not 3,070
    expect(afterCust.walletBalance).toBe(0);                  // QR / credit never touch a wallet that is empty
    const je = await journal('SALE', r.body.data.id);
    expect(side(je, 'DEBIT', acct.ar)).toBe(3000);
    expect(r2(side(je, 'DEBIT', bankGlAccountId) - side(je, 'CREDIT', bankGlAccountId))).toBe(6930);
    expect(side(je, 'DEBIT', acct.paymentCharges)).toBe(70);
    expect(revenue(je)).toBe(10000);
  });

  it('a retry of the same sale returns the stored sale: one fee, one journal, even if the settings changed', async () => {
    const k = key();
    const first = await sell(custom(8000), [qr(8000)], { clientRequestId: k });
    expect(first.status).toBe(201);
    expect((await setFee(1000, 5)).status).toBe(200);
    const again = await sell(custom(8000), [qr(8000)], { clientRequestId: k });
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    const rows = await paymentRows(first.body.data.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 8000, feePercent: 1, feeAmount: 80, netAmount: 7920 }); // stored values, not the new 5 %
    expect((await setFee(5000, 1)).status).toBe(200);
    await journal('SALE', first.body.data.id);
    await posting.postSale(first.body.data.id, tenantId); // a re-run of the posting (outbox retry) adds nothing
    await posting.postSale(first.body.data.id, tenantId);
    const jes = await prisma.journalEntry.findMany({ where: { tenantId, referenceType: 'SALE', referenceId: first.body.data.id, status: { not: 'VOID' } }, include: { lines: true } });
    expect(jes).toHaveLength(1);
    expect(side(jes[0], 'DEBIT', acct.paymentCharges)).toBe(80);
  });

  it('parallel submits of the same sale create one sale with one fee', async () => {
    const k = key();
    const [a, b] = await Promise.all([sell(custom(7000), [qr(7000)], { clientRequestId: k }), sell(custom(7000), [qr(7000)], { clientRequestId: k })]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    const rows = await paymentRows(a.body.data.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ feeAmount: 70, netAmount: 6930 });
    expect(await prisma.sale.count({ where: { tenantId, clientRequestId: k } })).toBe(1);
  });

  it('settings: only an admin changes them; negative, huge, over-precise or non-numeric values are refused', async () => {
    expect((await put(cashier, '/tenants/pos-settings', { qrFeePercent: 2 })).status).toBe(403);
    for (const bad of [{ qrFeeThreshold: -1 }, { qrFeePercent: -0.5 }, { qrFeePercent: 100 }, { qrFeePercent: 20.01 }, { qrFeeThreshold: 1e12 }, { qrFeePercent: 1.234 }, { qrFeeThreshold: 10.005 }, { qrFeeThreshold: 'abc' }]) {
      expect((await put(admin, '/tenants/pos-settings', bad)).status).toBe(400);
    }
    expect((await get(admin, '/tenants/pos-settings')).body.data).toMatchObject({ qrFeeThreshold: 5000, qrFeePercent: 1 });
  });

  it('settings are per shop: changing this shop never changes another shop', async () => {
    expect((await setFee(2000, 2.5)).status).toBe(200);
    expect((await get(admin, '/tenants/pos-settings')).body.data).toMatchObject({ qrFeeThreshold: 2000, qrFeePercent: 2.5 });
    expect((await get(adminB, '/tenants/pos-settings', subB)).body.data).toMatchObject({ qrFeeThreshold: 5000, qrFeePercent: 1 });
    expect((await setFee(5000, 1)).status).toBe(200);
  });

  it('changing the settings applies to NEW sales only; old sales keep their stored gross / fee / net', async () => {
    const old = await sell(custom(6000), [qr(6000)]);
    const oldRow = (await paymentRows(old.body.data.id))[0];
    expect(oldRow).toMatchObject({ feePercent: 1, feeAmount: 60, netAmount: 5940 });

    const saved = await setFee(2000, 2.5);
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ qrFeeThreshold: 2000, qrFeePercent: 2.5 });
    const fresh = await sell(custom(3000), [qr(3000)]);
    expect((await paymentRows(fresh.body.data.id))[0]).toMatchObject({ amount: 3000, feePercent: 2.5, feeAmount: 75, netAmount: 2925 });
    expect((await sell(custom(2000), [qr(2000)])).body.data.id).toBeTruthy();
    expect((await paymentRows(old.body.data.id))[0]).toEqual(oldRow);

    expect((await setFee(0, 0)).status).toBe(200); // 0 % switches the fee off
    const off = await sell(custom(9999), [qr(9999)]);
    expect((await paymentRows(off.body.data.id))[0]).toMatchObject({ feeAmount: 0, netAmount: 9999 });
    expect((await setFee(5000, 1)).status).toBe(200);
    // the journal of the old sale still carries its own fee
    expect(side(await journal('SALE', old.body.data.id), 'DEBIT', acct.paymentCharges)).toBe(60);
  });

  it('journal of a QR sale: Dr bank 10,000 / Cr sales 10,000, then Dr payment charges 100 / Cr bank 100 — bank keeps 9,900', async () => {
    const r = await sell(custom(10000), [qr(10000)]);
    const je = await journal('SALE', r.body.data.id);
    expect(side(je, 'DEBIT', bankGlAccountId)).toBe(10000);
    expect(side(je, 'CREDIT', bankGlAccountId)).toBe(100);
    expect(side(je, 'DEBIT', acct.paymentCharges)).toBe(100);
    expect(side(je, 'CREDIT', acct.paymentCharges)).toBe(0);
    expect(revenue(je)).toBe(10000); // revenue is the invoice, not more, not less
    expect(side(je, 'DEBIT')).toBe(side(je, 'CREDIT'));
  });

  it('a QR sale without a fee posts exactly as before (no fee lines)', async () => {
    const r = await sell(custom(4000), [qr(4000)]);
    const je = await journal('SALE', r.body.data.id);
    expect(side(je, 'DEBIT', acct.paymentCharges)).toBe(0);
    expect(side(je, 'CREDIT', bankGlAccountId)).toBe(0);
    expect(side(je, 'DEBIT', bankGlAccountId)).toBe(4000);
  });

  it('goods returns refund the goods value and never reverse the QR fee, whatever the settings are now', async () => {
    const sale = await sell([{ variantId, productName: 'Rice', variantName: 'Default', sku: 'S', quantity: 30, unitPrice: 200, costPrice: 120 }], [qr(6000)]);
    expect(sale.status).toBe(201);
    const row = (await paymentRows(sale.body.data.id))[0];
    expect(row).toMatchObject({ amount: 6000, feeAmount: 60, netAmount: 5940 });
    const saleJe = await journal('SALE', sale.body.data.id);
    expect(side(saleJe, 'DEBIT', acct.paymentCharges)).toBe(60);

    const r1 = await post(admin, '/returns', { clientRequestId: rid(), originalSaleId: sale.body.data.id, reason: 'DEFECTIVE', items: [{ variantId, quantity: 10 }] });
    expect(r1.status).toBe(201);
    returnIds.push(r1.body.data.id);
    expect(r1.body.data.refundAmount ?? r1.body.data.totalRefund ?? r1.body.data.total).toBe(2000);
    const je1 = await journal('SALE_RETURN', r1.body.data.id);
    expect(side(je1, 'CREDIT', bankGlAccountId)).toBe(2000);
    expect(side(je1, 'DEBIT', acct.paymentCharges) + side(je1, 'CREDIT', acct.paymentCharges)).toBe(0); // fee untouched
    expect(side(je1, 'DEBIT')).toBe(side(je1, 'CREDIT'));

    expect((await setFee(100, 5)).status).toBe(200); // settings changed after the sale
    const r2nd = await post(admin, '/returns', { clientRequestId: rid(), originalSaleId: sale.body.data.id, reason: 'DEFECTIVE', items: [{ variantId, quantity: 20 }] });
    expect(r2nd.status).toBe(201);
    returnIds.push(r2nd.body.data.id);
    const je2 = await journal('SALE_RETURN', r2nd.body.data.id);
    expect(side(je2, 'CREDIT', bankGlAccountId)).toBe(4000);         // fully returned: 6,000 gross back to the customer
    expect(side(je2, 'DEBIT', acct.paymentCharges) + side(je2, 'CREDIT', acct.paymentCharges)).toBe(0);
    expect(await paymentRows(sale.body.data.id)).toEqual([row]);     // the stored payment never changes
    expect((await setFee(5000, 1)).status).toBe(200);
  });

  it('the sale API returns gross / % / fee / net; the customer bill message never mentions the fee', async () => {
    const r = await sell(custom(12000), [qr(12000)], { customerId });
    const detail = await get(admin, `/sales/${r.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.payments[0]).toMatchObject({ method: 'QR', amount: 12000, feePercent: 1, feeAmount: 120, netAmount: 11880 });
    const msg = await get(admin, `/sales/${r.body.data.id}/bill-message`);
    expect(msg.status).toBe(200);
    expect(msg.body.data.message).toMatch(/Total: LKR 12,000\.00/);
    expect(msg.body.data.message).toMatch(/Payment: QR\n/);
    expect(msg.body.data.message).not.toMatch(/fee/i);
  });

  it('ledger reconciliation: every journal balances, the trial balance balances, payment charges = Σ stored fees, bank = Σ net − refunds', async () => {
    for (let i = 0; i < 60; i++) {
      const busy = await prisma.accountingOutboxEvent.count({ where: { tenantId, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (!busy) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    for (const id of saleIds) await journal('SALE', id);
    expect(await prisma.accountingOutboxEvent.count({ where: { tenantId, status: 'FAILED' } })).toBe(0);

    const jes = await prisma.journalEntry.findMany({ where: { tenantId, status: { not: 'VOID' } }, include: { lines: true } });
    for (const je of jes) expect([je.id, side(je, 'DEBIT')]).toEqual([je.id, side(je, 'CREDIT')]);
    const all = jes.flatMap((j) => j.lines);
    const total = (type: string) => r2(all.filter((l) => l.type === type).reduce((s, l) => s + l.amount, 0));
    expect(total('DEBIT')).toBe(total('CREDIT'));

    // one SALE journal per sale (no duplicates)
    const perSale = await prisma.journalEntry.groupBy({ by: ['referenceId'], where: { tenantId, referenceType: 'SALE', status: { not: 'VOID' } }, _count: { _all: true } });
    expect(perSale.every((g) => g._count._all === 1)).toBe(true);

    const pays = await prisma.salePayment.findMany({ where: { sale: { tenantId }, method: 'QR' } });
    const fees = r2(pays.reduce((s, p) => s + (p.feeAmount ?? 0), 0));
    const net = r2(pays.reduce((s, p) => s + (p.netAmount ?? p.amount), 0));
    const gross = r2(pays.reduce((s, p) => s + p.amount, 0));
    expect(r2(gross - fees)).toBe(net);
    const bal = (account: string) => r2(all.filter((l) => l.type === 'DEBIT' && l.debitAccountId === account).reduce((s, l) => s + l.amount, 0) - all.filter((l) => l.type === 'CREDIT' && l.creditAccountId === account).reduce((s, l) => s + l.amount, 0));
    expect(bal(acct.paymentCharges)).toBe(fees);
    const refundedToBank = r2(jes.filter((j) => returnIds.includes(j.referenceId ?? '')).reduce((s, j) => s + side(j, 'CREDIT', bankGlAccountId), 0));
    expect(refundedToBank).toBe(6000);
    expect(bal(bankGlAccountId)).toBe(r2(net - refundedToBank));
  });
});
