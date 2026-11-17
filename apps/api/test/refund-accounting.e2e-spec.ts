/**
 * Refund accounting, over HTTP on the full AppModule against PostgreSQL + Redis: every tender of the
 * original sale (cash, card, QR, bank, customer wallet, gift voucher, customer credit) is refunded to the
 * right place AND posted to the right GL account; every journal balances; partial and split refunds;
 * duplicate / concurrent returns and double credit reversals are refused.
 * Needs DATABASE_URL (a TEST database) and REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
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
import { AccountingPostingService } from '../src/modules/accounting/accounting-posting.service';

jest.setTimeout(300_000);

const r2 = (n: number) => Math.round(n * 100) / 100;

let __retSeq = 0;
const rid = () => `e2e-ret-${Date.now().toString(36)}-${(__retSeq++).toString(36)}`;

describe('Refund accounting: tenders, journals, duplicates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: AccountingPostingService;
  const PASSWORD = `Ra-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  let token = '';
  let T = { id: '', sub: '', branchId: '', counterId: '', variantId: '', bankPlain: '', bankGl: '', bankGlAccountId: '', customerId: '', voucherCode: '' };
  let acct: Awaited<ReturnType<AccountingPostingService['resolveAccounts']>>;
  const PRICE = 200;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': T.sub, Host: 'localhost', 'x-pos-counter-id': T.counterId });
  const post = async (url: string, body: unknown) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr()).send(body as object);
  };
  const sell = async (qty: number, payments: object[], extra: object = {}) => {
    const r = await post('/pos/sale', {
      items: [{ variantId: T.variantId, productName: 'Rice', variantName: 'Default', sku: 'R', quantity: qty, unitPrice: PRICE, costPrice: 120 }],
      payments, applyTierDiscount: false, ...extra,
    });
    if (r.status !== 201) throw new Error(`sale ${r.status} ${JSON.stringify(r.body?.message)}`);
    await new Promise((res) => setTimeout(res, 600)); // sale cash movement follows the sale
    return r.body.data as { id: string; total: number };
  };
  let freshSeq = 0;
  /** Zero-wallet customer with a credit limit: the Credit / Wallet tender is wallet-first, so credit scenarios need an empty wallet. */
  const freshCustomer = async (label: string) => (await prisma.customer.create({
    data: { tenantId: T.id, firstName: label, phone: `07${(Number.parseInt(run.slice(-5), 36) + 777 * ++freshSeq).toString().padStart(8, '0').slice(-8)}`, walletBalance: 0, creditLimit: 100000 },
  })).id;
  const giveBack = (saleId: string, qty: number) => post('/returns', { clientRequestId: rid(), originalSaleId: saleId, reason: 'DEFECTIVE', items: [{ variantId: T.variantId, quantity: qty }] });

  /** The return's journal (posted by the outbox; posted directly if the outbox has not run yet). */
  async function journalOf(referenceType: 'SALE' | 'SALE_RETURN', id: string) {
    for (let i = 0; i < 20; i++) {
      const je = await prisma.journalEntry.findFirst({ where: { tenantId: T.id, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
      if (je) return je;
      await new Promise((res) => setTimeout(res, 500));
    }
    if (referenceType === 'SALE') await posting.postSale(id, T.id);
    else await posting.postReturn(id, T.id);
    return prisma.journalEntry.findFirstOrThrow({ where: { tenantId: T.id, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
  }
  /** Credits (or debits) per account, and the debit / credit totals. */
  function sides(je: { lines: { type: string; amount: number; debitAccountId: string | null; creditAccountId: string | null }[] }) {
    const credit = new Map<string, number>();
    const debit = new Map<string, number>();
    let dr = 0;
    let cr = 0;
    for (const l of je.lines) {
      if (l.type === 'DEBIT') { dr += l.amount; debit.set(l.debitAccountId!, r2((debit.get(l.debitAccountId!) ?? 0) + l.amount)); }
      else { cr += l.amount; credit.set(l.creditAccountId!, r2((credit.get(l.creditAccountId!) ?? 0) + l.amount)); }
    }
    return { credit, debit, dr: r2(dr), cr: r2(cr) };
  }
  const drawerCash = async () => {
    const reg = await prisma.cashRegister.findFirst({ where: { tenantId: T.id, branchId: T.branchId, status: 'OPEN', clearedAt: null }, include: { movements: true } });
    let x = reg!.openingCash;
    for (const m of reg!.movements) {
      if (['SALE', 'DEPOSIT', 'PAYMENT'].includes(m.type)) x += m.amount;
      if (['EXPENSE', 'REFUND', 'WITHDRAWAL'].includes(m.type)) x -= m.amount;
    }
    return r2(x);
  };

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

    const sub = `ra${run}`;
    const t = await prisma.tenant.create({ data: { name: 'RA shop', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: 'WH-RA', isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Manager', type: RoleType.BRANCH_MANAGER, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const user = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `mgr-${run}@ra.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'Mgr', lastName: 'RA', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: 'Rice', slug: `rice-ra-${run}`, sku: `RRA-${run}`, sellingPrice: PRICE, costPrice: 120, mrp: 250, status: 'ACTIVE',
        variants: { create: { sku: `RRA-${run}-V`, name: 'Default', sellingPrice: PRICE, costPrice: 120, mrp: 250 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 1000 } });
    acct = await posting.resolveAccounts(t.id); // creates the default chart of accounts
    const glForBank = await prisma.account.create({ data: { tenantId: t.id, code: `1299${run.slice(-3)}`, name: 'Commercial Bank (QR)', type: 'ASSET' } });
    const bankPlain = await prisma.bankAccount.create({ data: { tenantId: t.id, code: 'BNK-P', name: 'Plain bank' } });
    const bankGl = await prisma.bankAccount.create({ data: { tenantId: t.id, code: 'BNK-G', name: 'QR bank', glAccountId: glForBank.id } });
    const customer = await prisma.customer.create({ data: { tenantId: t.id, firstName: 'Nimal', phone: `07${run.slice(-8)}`, walletBalance: 1000, creditLimit: 100000 } });
    const voucherCode = `GV-${run}`.toUpperCase();
    await prisma.giftVoucher.create({ data: { tenantId: t.id, code: voucherCode, initialAmount: 1000, balance: 1000 } });

    T = { id: t.id, sub, branchId: branch.id, counterId: counter.id, variantId: product.variants[0].id, bankPlain: bankPlain.id, bankGl: bankGl.id, bankGlAccountId: glForBank.id, customerId: customer.id, voucherCode };
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.data.accessToken;
    expect((await post('/cash/open', { openingCash: 20000, counterId: T.counterId })).status).toBe(201);
  });

  afterAll(async () => { await app?.close(); });

  it('cash sale, two partial returns: cash leaves the drawer twice, each journal balances, a third return is refused', async () => {
    const sale = await sell(2, [{ method: 'CASH', amount: 2 * PRICE }]);
    const before = await drawerCash();
    const r1 = await giveBack(sale.id, 1);
    expect(r1.status).toBe(201);
    const r2_ = await giveBack(sale.id, 1);
    expect(r2_.status).toBe(201);
    expect(await drawerCash()).toBe(r2(before - 2 * PRICE));
    for (const r of [r1, r2_]) {
      const s = sides(await journalOf('SALE_RETURN', r.body.data.id));
      expect(s.dr).toBe(s.cr);
      expect(s.credit.get(acct!.cashierWallet) ?? s.credit.get(acct!.cash)).toBe(PRICE);
    }
    expect((await giveBack(sale.id, 1)).status).toBe(400);
  });

  it('split card + cash + QR + bank: each share is credited to its own account', async () => {
    const sale = await sell(4, [
      { method: 'CARD', amount: 200, cardLast4: '4242' },
      { method: 'CASH', amount: 200 },
      { method: 'QR', amount: 200, bankAccountId: T.bankGl },
      { method: 'BANK_TRANSFER', amount: 200, bankAccountId: T.bankPlain },
    ]);
    const saleJe = sides(await journalOf('SALE', sale.id));
    expect(saleJe.dr).toBe(saleJe.cr);
    expect(saleJe.debit.get(T.bankGlAccountId)).toBe(200);

    const before = await drawerCash();
    const ret = await giveBack(sale.id, 2); // half the bill
    expect(ret.status).toBe(201);
    expect(await drawerCash()).toBe(r2(before - 100));
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.card)).toBe(100);
    expect(s.credit.get(T.bankGlAccountId)).toBe(100); // QR → the bank the sale was paid into
    expect(s.credit.get(acct!.bank)).toBe(100);
    expect(s.credit.get(acct!.cashierWallet) ?? s.credit.get(acct!.cash)).toBe(100);
  });

  it('customer wallet: the share goes back to the wallet and is credited to the wallet liability', async () => {
    const before = (await prisma.customer.findUniqueOrThrow({ where: { id: T.customerId } })).walletBalance;
    const sale = await sell(2, [{ method: 'WALLET', amount: 400 }], { customerId: T.customerId });
    const saleJe = sides(await journalOf('SALE', sale.id));
    expect(saleJe.debit.get(acct!.wallet)).toBe(400);
    const cashBefore = await drawerCash();
    const ret = await giveBack(sale.id, 1);
    expect(ret.status).toBe(201);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: T.customerId } })).walletBalance).toBe(r2(before - 400 + 200));
    expect(await prisma.walletTransaction.count({ where: { referenceId: ret.body.data.id, type: 'RETURN_REFUND', amount: 200 } })).toBe(1);
    expect(await drawerCash()).toBe(cashBefore);
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.wallet)).toBe(200);
  });

  it('gift voucher: the share is restored to the voucher and credited to the voucher liability', async () => {
    const sale = await sell(2, [{ method: 'GIFT_VOUCHER', amount: 300, reference: T.voucherCode }, { method: 'CASH', amount: 100 }]);
    expect((await prisma.giftVoucher.findFirstOrThrow({ where: { tenantId: T.id, code: T.voucherCode } })).balance).toBe(700);
    const ret = await giveBack(sale.id, 2);
    expect(ret.status).toBe(201);
    const v = await prisma.giftVoucher.findFirstOrThrow({ where: { tenantId: T.id, code: T.voucherCode } });
    expect(v).toMatchObject({ balance: 1000, status: 'ACTIVE' });
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.gift)).toBe(300);
    expect(s.credit.get(acct!.cashierWallet) ?? s.credit.get(acct!.cash)).toBe(100);
  });

  it('customer credit: partial returns reverse the open charge once; never below zero, never in cash', async () => {
    const cust = await freshCustomer('CreditRefund');
    const c0 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    const sale = await sell(3, [{ method: 'CUSTOMER_CREDIT', amount: 600 }], { customerId: cust });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: cust } })).creditBalance).toBe(r2(c0.creditBalance + 600)); // real credit was created
    const cashBefore = await drawerCash();
    const ret = await giveBack(sale.id, 1);
    expect(ret.status).toBe(201);
    const c1 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    expect(c1.creditBalance).toBe(r2(c0.creditBalance + 600 - 200));
    expect(await drawerCash()).toBe(cashBefore);
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.ar)).toBe(200);

    // Concurrent duplicate returns of the remaining two: exactly one succeeds, one reversal.
    await pace();
    // Two DIFFERENT requests (distinct clientRequestId) for the same remaining goods: exactly one may succeed.
    const bodyOf = () => ({ clientRequestId: rid(), originalSaleId: sale.id, reason: 'DEFECTIVE', items: [{ variantId: T.variantId, quantity: 2 }] });
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/returns').set(hdr()).send(bodyOf()),
      request(app.getHttpServer()).post('/api/v1/returns').set(hdr()).send(bodyOf()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const c2 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    expect(c2.creditBalance).toBe(c0.creditBalance);
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: T.id, referenceId: sale.id, type: 'CREDIT_NOTE' } })).toBe(2);
    const charge = await prisma.customerCreditTransaction.findFirstOrThrow({ where: { tenantId: T.id, referenceId: sale.id, type: 'CHARGE' } });
    expect(charge.paidAmount).toBe(600);
    expect(await drawerCash()).toBe(cashBefore);
  });

  it('paid-off credit: the share becomes store credit in the wallet (wallet liability), not a second reversal', async () => {
    const cust = await freshCustomer('PaidOff');
    const sale = await sell(1, [{ method: 'CUSTOMER_CREDIT', amount: 200 }], { customerId: cust });
    // The customer settles the bill in cash first.
    const pay = await post(`/customers/${cust}/credit/payment`, {
      amount: 200,
      paymentMethod: 'CASH',
      clientRequestId: 'refund-credit-payment-1',
    });
    expect(pay.status).toBe(201);
    const c0 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    expect(c0.creditBalance).toBe(0);
    const ret = await giveBack(sale.id, 1);
    expect(ret.status).toBe(201);
    const c1 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    expect(c1.creditBalance).toBe(c0.creditBalance); // nothing left to reverse
    expect(c1.walletBalance).toBe(r2(c0.walletBalance + 200));
    expect(await prisma.walletTransaction.count({ where: { referenceId: ret.body.data.id, type: 'RETURN_CREDIT', amount: 200 } })).toBe(1);
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.wallet)).toBe(200);
    expect(s.credit.get(acct!.ar)).toBeUndefined();
  });

  it('partial-pay sale: cash share from the drawer, unpaid share reversed on credit', async () => {
    const cust = await freshCustomer('PartialPay');
    // 2 x 200 = 400: LKR 100 cash + the unpaid LKR 300 as an explicit Customer Credit tender (a short cash payment alone is refused)
    const short = await post('/pos/sale', {
      items: [{ variantId: T.variantId, productName: 'Rice', variantName: 'Default', sku: 'R', quantity: 2, unitPrice: PRICE, costPrice: 120 }],
      payments: [{ method: 'CASH', amount: 100 }], applyTierDiscount: false, customerId: cust, allowPartialPayment: true,
    });
    expect(short.status).toBe(400);
    const sale = await sell(2, [{ method: 'CASH', amount: 100 }, { method: 'CUSTOMER_CREDIT', amount: 300 }], { customerId: cust });
    const c0 = await prisma.customer.findUniqueOrThrow({ where: { id: cust } });
    expect(c0.creditBalance).toBe(300);
    const cashBefore = await drawerCash();
    const ret = await giveBack(sale.id, 2);
    expect(ret.status).toBe(201);
    expect(await drawerCash()).toBe(r2(cashBefore - 100));
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: cust } })).creditBalance).toBe(0); // the 300 charge is reversed
    const s = sides(await journalOf('SALE_RETURN', ret.body.data.id));
    expect(s.dr).toBe(s.cr);
    expect(s.credit.get(acct!.ar)).toBe(300);
  });

  it('every refund journal in the shop balances, and each return has exactly one', async () => {
    const rets = await prisma.return.findMany({ where: { tenantId: T.id }, select: { id: true } });
    expect(rets.length).toBeGreaterThanOrEqual(9);
    for (const r of rets) {
      const jes = await prisma.journalEntry.findMany({ where: { tenantId: T.id, referenceType: 'SALE_RETURN', referenceId: r.id, status: { not: 'VOID' } }, include: { lines: true } });
      expect(jes).toHaveLength(1);
      const s = sides(jes[0]);
      expect(s.dr).toBe(s.cr);
      // Re-posting is a no-op (outbox retries cannot double-post).
      expect((await posting.postReturn(r.id, T.id))?.skipped).toBe(true);
    }
  });
});
