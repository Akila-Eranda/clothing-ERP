/**
 * Customer wallet ledger (account 2400 "Customer Wallet Advances", LIABILITY), over HTTP on the full
 * AppModule against PostgreSQL + Redis. Every wallet movement goes through the real flows, so the GL
 * balance of 2400 must equal the sum of the customers' wallet balances at every step:
 *   top-up (credit overpayment → advance) · wallet sale · wallet refund · wallet used to settle credit.
 * Also: already-posted journals are never re-posted or changed.
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

describe('Customer wallet ledger (2400) reconciles with wallet balances', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: AccountingPostingService;
  const PASSWORD = `Wl-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  const PRICE = 200;
  let token = '';
  const T = { id: '', sub: '', branchId: '', counterId: '', variantId: '', customerId: '', wallet2400: '', ar: '' };

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': T.sub, Host: 'localhost', 'x-pos-counter-id': T.counterId });
  const post = async (url: string, body: unknown) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr()).send(body as object);
  };
  const get = async (url: string) => {
    await pace();
    return request(app.getHttpServer()).get(`/api/v1${url}`).set(hdr());
  };
  const sell = async (qty: number, payments: object[]) => {
    const r = await post('/pos/sale', {
      items: [{ variantId: T.variantId, productName: 'Dhal', variantName: 'Default', sku: 'D', quantity: qty, unitPrice: PRICE, costPrice: 120 }],
      payments, applyTierDiscount: false, customerId: T.customerId,
    });
    if (r.status !== 201) throw new Error(`sale ${r.status} ${JSON.stringify(r.body?.message)}`);
    return r.body.data as { id: string };
  };

  /** Waits until the outbox has posted `n` journals of a type (falls back to posting directly for docs). */
  async function waitJournals(referenceType: string, n: number) {
    for (let i = 0; i < 30; i++) {
      const c = await prisma.journalEntry.count({ where: { tenantId: T.id, referenceType, status: { not: 'VOID' } } });
      if (c >= n) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`expected ${n} ${referenceType} journals`);
  }
  async function ensurePosted(kind: 'SALE' | 'SALE_RETURN', id: string) {
    for (let i = 0; i < 20; i++) {
      if (await prisma.journalEntry.count({ where: { tenantId: T.id, referenceType: kind, referenceId: id, status: { not: 'VOID' } } })) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (kind === 'SALE') await posting.postSale(id, T.id);
    else await posting.postReturn(id, T.id);
  }
  /** Liability balance of 2400 from POSTED journal lines (credits − debits). */
  async function glWallet() {
    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: { tenantId: T.id, status: { not: 'VOID' } }, OR: [{ debitAccountId: T.wallet2400 }, { creditAccountId: T.wallet2400 }] },
      select: { type: true, amount: true },
    });
    return r2(lines.reduce((s, l) => s + (l.type === 'CREDIT' ? l.amount : -l.amount), 0));
  }
  const wallets = async () => r2((await prisma.customer.aggregate({ where: { tenantId: T.id }, _sum: { walletBalance: true } }))._sum.walletBalance ?? 0);
  async function expectReconciled(expected: number) {
    expect(await wallets()).toBe(expected);            // customer balances are written synchronously
    for (let i = 0; i < 30 && (await glWallet()) !== expected; i++) await new Promise((r) => setTimeout(r, 500)); // GL follows via the outbox
    expect(await glWallet()).toBe(expected);           // ... and must then equal them exactly
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
    posting = moduleFixture.get(AccountingPostingService);

    const sub = `wl${run}`;
    const t = await prisma.tenant.create({ data: { name: 'WL shop', subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: 'WH-WL', isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Manager', type: RoleType.BRANCH_MANAGER, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const user = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `mgr-${run}@wl.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'Mgr', lastName: 'WL', status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: 'Dhal', slug: `dhal-wl-${run}`, sku: `DWL-${run}`, sellingPrice: PRICE, costPrice: 120, mrp: 250, status: 'ACTIVE',
        variants: { create: { sku: `DWL-${run}-V`, name: 'Default', sellingPrice: PRICE, costPrice: 120, mrp: 250 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 1000, damagedQty: 0, returnedQty: 0 } });
    const accts = await posting.resolveAccounts(t.id); // default chart of accounts
    const a2400 = await prisma.account.findFirstOrThrow({ where: { tenantId: t.id, code: '2400' } });
    // 2400 is a liability named for customer advances, and it is what the posting rules use for the wallet
    expect(a2400).toMatchObject({ type: 'LIABILITY', name: 'Customer Wallet Advances', isActive: true });
    expect(accts!.wallet).toBe(a2400.id);
    expect(accts!.gift).not.toBe(a2400.id); // gift vouchers have their own liability (2410)
    const customer = await prisma.customer.create({ data: { tenantId: t.id, firstName: 'Kamala', phone: `07${run.slice(-8)}`, creditLimit: 100000 } });
    Object.assign(T, { id: t.id, sub, branchId: branch.id, counterId: counter.id, variantId: product.variants[0].id, customerId: customer.id, wallet2400: a2400.id, ar: accts!.ar });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.data.accessToken;
    expect((await post('/cash/open', { openingCash: 5000, counterId: T.counterId })).status).toBe(201);
  });

  afterAll(async () => { await app?.close(); });

  it('top-up (overpayment with no credit owed → advance): Dr cash / Cr 2400; wallet = GL', async () => {
    const r = await post(`/customers/${T.customerId}/credit/payment`, {
      amount: 1000,
      paymentMethod: 'CASH',
      clientRequestId: 'wallet-ledger-topup-1',
    });
    expect(r.status).toBe(201);
    expect(r.body.data.advanceToWallet).toBe(1000);
    await waitJournals('CUSTOMER_CREDIT_PAYMENT', 1);
    const je = await prisma.journalEntry.findFirstOrThrow({ where: { tenantId: T.id, referenceType: 'CUSTOMER_CREDIT_PAYMENT' }, include: { lines: true } });
    expect(je.lines.find((l) => l.creditAccountId === T.wallet2400)?.amount).toBe(1000);
    await expectReconciled(1000);
  });

  it('wallet sale: Dr 2400 (not UPI clearing); wallet = GL', async () => {
    const sale = await sell(2, [{ method: 'WALLET', amount: 400 }]);
    await ensurePosted('SALE', sale.id);
    const je = await prisma.journalEntry.findFirstOrThrow({ where: { tenantId: T.id, referenceType: 'SALE', referenceId: sale.id }, include: { lines: true } });
    expect(je.lines.find((l) => l.debitAccountId === T.wallet2400)?.amount).toBe(400);
    const dr = je.lines.filter((l) => l.type === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const cr = je.lines.filter((l) => l.type === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(r2(dr)).toBe(r2(cr));
    await expectReconciled(600);

    // refund half: back to the wallet, Cr 2400
    const ret = await post('/returns', {
      clientRequestId: `wl-return-${run}`,
      originalSaleId: sale.id,
      reason: 'DEFECTIVE',
      items: [{ variantId: T.variantId, quantity: 1 }],
    });
    expect(ret.status).toBe(201);
    await ensurePosted('SALE_RETURN', ret.body.data.id);
    await expectReconciled(800);
  });

  // ── fixtures for the wallet-first / credit-first allocation rules (each test uses its OWN customer) ──
  let custSeq = 0;
  const newCustomer = async (label: string) => (await prisma.customer.create({
    data: { tenantId: T.id, firstName: label, phone: `07${(Number.parseInt(run.slice(-5), 36) + 1000 * ++custSeq).toString().padStart(8, '0').slice(-8)}`, creditLimit: 100000 },
  })).id;
  const bal = async (id: string) => prisma.customer.findFirstOrThrow({ where: { id, tenantId: T.id }, select: { creditBalance: true, walletBalance: true } });
  const sellTo = async (customerId: string, qty: number, payments: object[]) => post('/pos/sale', {
    items: [{ variantId: T.variantId, productName: 'Dhal', variantName: 'Default', sku: 'D', quantity: qty, unitPrice: PRICE, costPrice: 120 }],
    payments, applyTierDiscount: false, customerId,
  });
  let payKey = 0;
  const payKeyNext = () => `wl-pay-${run}-${(payKey++).toString(36)}`;
  const pay = (customerId: string, body: object) => post(`/customers/${customerId}/credit/payment`, { clientRequestId: payKeyNext(), ...body });
  type JLine = { type: string; amount: number; debitAccountId: string | null; creditAccountId: string | null };
  const saleJournalLines = async (saleId: string): Promise<JLine[]> => {
    await ensurePosted('SALE', saleId);
    return (await prisma.journalEntry.findFirstOrThrow({ where: { tenantId: T.id, referenceType: 'SALE', referenceId: saleId, status: { not: 'VOID' } }, include: { lines: true } })).lines;
  };
  const amountOn = (lines: JLine[], side: 'DEBIT' | 'CREDIT', acct: string) =>
    r2(lines.filter((l) => l.type === side && (side === 'DEBIT' ? l.debitAccountId : l.creditAccountId) === acct).reduce((x, l) => x + l.amount, 0));

  it('wallet used to settle credit: Dr 2400 / Cr AR; wallet = GL (fresh customer: credit first, wallet funded afterwards)', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('SettleFromWallet');
    // zero wallet -> the Credit / Wallet tender creates real customer credit
    const credit = await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }]);
    expect(credit.status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: PRICE, walletBalance: 0 });
    // a manager top-up (customer paid cash) funds the wallet while the credit is still open
    const topup = await post(`/customers/${cust}/wallet/topup`, { amount: PRICE, paymentMethod: 'CASH' });
    expect(topup.status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: PRICE, walletBalance: PRICE });
    const settle = await pay(cust, { amount: PRICE, applyFromWallet: true });
    expect(settle.status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: 0, walletBalance: 0 });
    let je = null as null | { lines: JLine[] };
    for (let i = 0; i < 30 && !je; i++) {
      je = await prisma.journalEntry.findFirst({
        where: { tenantId: T.id, referenceType: 'CUSTOMER_CREDIT_PAYMENT', status: { not: 'VOID' }, lines: { some: { debitAccountId: T.wallet2400, amount: PRICE } } },
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      });
      if (!je) await new Promise((r) => setTimeout(r, 500));
    }
    expect(je).toBeTruthy();
    expect(amountOn(je!.lines, 'CREDIT', T.ar)).toBe(PRICE);
    expect(amountOn(je!.lines, 'DEBIT', T.wallet2400)).toBe(PRICE);
    expect(await wallets()).toBe(walletsBefore);
    await expectReconciled(walletsBefore);
  });

  it('already-posted journals are never re-posted or changed', async () => {
    const before = await prisma.journalLine.findMany({ where: { journalEntry: { tenantId: T.id } }, orderBy: { id: 'asc' } });
    const sales = await prisma.sale.findMany({ where: { tenantId: T.id }, select: { id: true } });
    for (const s of sales) expect((await posting.postSale(s.id, T.id))?.skipped).toBe(true);
    const after = await prisma.journalLine.findMany({ where: { journalEntry: { tenantId: T.id } }, orderBy: { id: 'asc' } });
    expect(after).toEqual(before);
  });

  it('customer overpayment settles the open credit FIRST and keeps the excess in the wallet (fresh zero-wallet customer)', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('Overpay');
    expect((await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }])).status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: PRICE, walletBalance: 0 });   // the credit really exists

    const key = payKeyNext();
    const payment = await post(`/customers/${cust}/credit/payment`, { amount: PRICE + 300, paymentMethod: 'CASH', clientRequestId: key });
    expect(payment.status).toBe(201);
    expect(payment.body.data).toMatchObject({ appliedToCredit: PRICE, advanceToWallet: 300, creditBalance: 0, walletBalance: 300, idempotentReplay: false });
    expect(await bal(cust)).toEqual({ creditBalance: 0, walletBalance: 300 });
    expect(await prisma.walletTransaction.count({ where: { tenantId: T.id, customerId: cust, type: 'ADVANCE', amount: 300 } })).toBe(1);

    // Journal: Dr cash 500 / Cr AR 200 + Cr 2400 300 (exact decimals, balanced)
    let je = null as null | { lines: JLine[] };
    for (let i = 0; i < 30 && !je; i++) {
      je = await prisma.journalEntry.findFirst({
        where: { tenantId: T.id, referenceType: 'CUSTOMER_CREDIT_PAYMENT', status: { not: 'VOID' }, lines: { some: { creditAccountId: T.wallet2400, amount: 300 } } },
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      });
      if (!je) await new Promise((r) => setTimeout(r, 500));
    }
    expect(je).toBeTruthy();
    const dr = r2(je!.lines.filter((l) => l.type === 'DEBIT').reduce((x, l) => x + l.amount, 0));
    const cr = r2(je!.lines.filter((l) => l.type === 'CREDIT').reduce((x, l) => x + l.amount, 0));
    expect([dr, cr]).toEqual([500, 500]);
    expect(amountOn(je!.lines, 'CREDIT', T.ar)).toBe(PRICE);
    expect(amountOn(je!.lines, 'CREDIT', T.wallet2400)).toBe(300);

    // Duplicate (same clientRequestId, e.g. double click / lost response): nothing changes
    const replay = await post(`/customers/${cust}/credit/payment`, { amount: PRICE + 300, paymentMethod: 'CASH', clientRequestId: key });
    expect(replay.status).toBe(201);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(await bal(cust)).toEqual({ creditBalance: 0, walletBalance: 300 });
    expect(await prisma.walletTransaction.count({ where: { tenantId: T.id, customerId: cust, type: 'ADVANCE', amount: 300 } })).toBe(1);
    await expectReconciled(walletsBefore + 300);
  });

  it('customer payment concurrency: parallel identical requests apply once; parallel different payments never over-apply the debt', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('PayRace');
    expect((await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }])).status).toBe(201);
    // same key twice at once -> one effect
    const key = payKeyNext();
    const [x, y] = await Promise.all([
      post(`/customers/${cust}/credit/payment`, { amount: 100, paymentMethod: 'CASH', clientRequestId: key }),
      post(`/customers/${cust}/credit/payment`, { amount: 100, paymentMethod: 'CASH', clientRequestId: key }),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(await bal(cust)).toEqual({ creditBalance: 100, walletBalance: 0 });
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: T.id, customerId: cust, type: 'PAYMENT' } })).toBe(1);
    // two different payments of 100 each against the 100 left: the debt is settled once, the other 100 is advance
    const [p, q] = await Promise.all([
      post(`/customers/${cust}/credit/payment`, { amount: 100, paymentMethod: 'CASH', clientRequestId: payKeyNext() }),
      post(`/customers/${cust}/credit/payment`, { amount: 100, paymentMethod: 'CASH', clientRequestId: payKeyNext() }),
    ]);
    expect([p.status, q.status]).toEqual([201, 201]);
    expect(await bal(cust)).toEqual({ creditBalance: 0, walletBalance: 100 });   // never negative credit; 300 paid = 200 debt + 100 advance
    await expectReconciled(walletsBefore + 100);
  });

  it('a failing customer payment changes nothing (rollback): card without last 4, unknown method, wallet over-settle', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('PayFail');
    expect((await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }])).status).toBe(201);
    const txBefore = await prisma.customerCreditTransaction.count({ where: { tenantId: T.id, customerId: cust } });
    const wtBefore = await prisma.walletTransaction.count({ where: { tenantId: T.id, customerId: cust } });
    expect((await pay(cust, { amount: 50, paymentMethod: 'CARD' })).status).toBe(400);
    expect((await pay(cust, { amount: 50, paymentMethod: 'NOPE' })).status).toBe(400);
    const over = await pay(cust, { amount: 50, applyFromWallet: true });            // empty wallet
    expect(over.status).toBe(400);
    expect(String(over.body.message)).toMatch(/Insufficient wallet advance/);
    expect(await bal(cust)).toEqual({ creditBalance: PRICE, walletBalance: 0 });
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: T.id, customerId: cust } })).toBe(txBefore);
    expect(await prisma.walletTransaction.count({ where: { tenantId: T.id, customerId: cust } })).toBe(wtBefore);
    await expectReconciled(walletsBefore);
  });

  it('Credit / Wallet tender: the wallet covers the whole bill (wallet first, no credit created); Dr 2400', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('WalletCovers');
    expect((await pay(cust, { amount: 300, paymentMethod: 'CASH' })).body.data.advanceToWallet).toBe(300);   // wallet 300
    const sale = await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }]);                        // bill 200
    expect(sale.status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: 0, walletBalance: 100 });
    const lines = await saleJournalLines(sale.body.data.id);
    expect(amountOn(lines, 'DEBIT', T.wallet2400)).toBe(PRICE);
    expect(amountOn(lines, 'DEBIT', T.ar)).toBe(0);
    await expectReconciled(walletsBefore + 100);
  });

  it('Credit / Wallet tender: insufficient wallet is consumed first, the remainder is charged to customer credit', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('WalletShort');
    expect((await pay(cust, { amount: 150, paymentMethod: 'CASH' })).body.data.advanceToWallet).toBe(150);   // wallet 150
    const sale = await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }]);                        // bill 200 -> 150 wallet + 50 credit
    expect(sale.status).toBe(201);
    expect(await bal(cust)).toEqual({ creditBalance: 50, walletBalance: 0 });
    const lines = await saleJournalLines(sale.body.data.id);
    expect(amountOn(lines, 'DEBIT', T.wallet2400)).toBe(150);
    expect(amountOn(lines, 'DEBIT', T.ar)).toBe(50);
    await expectReconciled(walletsBefore);   // +150 advance, -150 consumed
  });

  it('Cash / Card tenders never touch wallet or customer credit (customer with both balances)', async () => {
    const walletsBefore = await wallets();
    const cust = await newCustomer('TenderIsolation');
    expect((await sellTo(cust, 1, [{ method: 'CUSTOMER_CREDIT', amount: PRICE }])).status).toBe(201);   // credit 200
    expect((await post(`/customers/${cust}/wallet/topup`, { amount: 120, paymentMethod: 'CASH' })).status).toBe(201); // wallet 120
    const both = { creditBalance: PRICE, walletBalance: 120 };
    expect(await bal(cust)).toEqual(both);
    const cash = await sellTo(cust, 1, [{ method: 'CASH', amount: PRICE }]);
    expect(cash.status).toBe(201);
    expect(await bal(cust)).toEqual(both);
    const card = await sellTo(cust, 1, [{ method: 'CARD', amount: PRICE, cardLast4: '4242' }]);
    expect(card.status).toBe(201);
    expect(await bal(cust)).toEqual(both);
    for (const sale of [cash, card]) {
      const lines = await saleJournalLines(sale.body.data.id);
      expect(amountOn(lines, 'DEBIT', T.wallet2400)).toBe(0);
      expect(amountOn(lines, 'DEBIT', T.ar)).toBe(0);
    }
    // a short cash payment cannot be moved onto credit / wallet implicitly
    const short = await sellTo(cust, 1, [{ method: 'CASH', amount: 100 }]);
    expect(short.status).toBe(400);
    expect(String(short.body.message)).toMatch(/select Customer Credit for the unpaid amount/);
    expect(await bal(cust)).toEqual(both);
    await expectReconciled(walletsBefore + 120);
  });

  it('customer history returns paginated branch sales and labels omitted all-branch balances', async () => {
    // pagination needs more than one entry: give the customer two more cash sales
    for (let i = 0; i < 2; i++) expect((await sell(1, [{ method: 'CASH', amount: PRICE }])).id).toBeTruthy();
    const first = await get(`/customers/${T.customerId}/transaction-history?limit=1`);
    expect(first.status).toBe(200);
    expect(first.body.data.entries).toHaveLength(1);
    expect(first.body.data.pageInfo).toMatchObject({ limit: 1, hasMore: true });
    expect(first.body.data.pageInfo.nextCursor).toEqual(expect.any(String));
    expect(first.body.data.branchScope).toEqual({
      branchFilterApplied: true,
      walletAndCreditEntriesOmitted: true,
      balancesAreAllBranches: true,
    });

    const next = await get(
      `/customers/${T.customerId}/transaction-history?limit=1&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.data.entries[0].id).not.toBe(first.body.data.entries[0].id);
  });

  it('POS summary reconciles order, item, tender and counter totals for the assigned branch', async () => {
    const summary = await get('/pos/summary');
    expect(summary.status).toBe(200);

    const expected = await prisma.sale.aggregate({
      where: { tenantId: T.id, branchId: T.branchId, status: 'COMPLETED' },
      _sum: { total: true },
      _count: { id: true },
    });
    expect(summary.body.data.totalSales).toBe(expected._count.id);
    expect(summary.body.data.totalRevenue).toBe(r2(expected._sum.total ?? 0));
    expect(summary.body.data.totalItems).toBeGreaterThan(0);
    expect(summary.body.data.byPaymentMethod).toEqual(expect.any(Object));
    expect(summary.body.data.byCounter.reduce(
      (count: number, counter: { orders: number }) => count + counter.orders,
      0,
    )).toBe(summary.body.data.totalSales);
  });

  it('accounting reconciliation exposes read-only wallet and journal checks', async () => {
    const before = await prisma.journalEntry.count({ where: { tenantId: T.id } });
    const response = await get(`/accounting/reconciliation?branchId=${T.branchId}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ readOnly: true, filters: { branchId: T.branchId } });
    expect(response.body.data.checks.map((check: { key: string }) => check.key)).toEqual(
      expect.arrayContaining(['trial_balance', 'unbalanced_entries', 'wallet_2400', 'wallet_history']),
    );
    expect(await prisma.journalEntry.count({ where: { tenantId: T.id } })).toBe(before);
  });
});
