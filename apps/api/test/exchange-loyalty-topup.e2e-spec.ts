/**
 * Wallet top-ups (funded / goodwill), loyalty points on refunds, exchanges and supplier cash approval for
 * PO receive / Quick GRN — over HTTP on the full AppModule against PostgreSQL + Redis, checking the actual
 * balances, ledgers and journal lines.
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
import { hashPosPin } from '../src/modules/pos/pos-pin.helper';

jest.setTimeout(400_000);
const r2 = (n: number) => Math.round(n * 100) / 100;

type Je = { lines: { type: string; amount: number; debitAccountId: string | null; creditAccountId: string | null }[] };

let __retSeq = 0;
const rid = () => `e2e-ret-${Date.now().toString(36)}-${(__retSeq++).toString(36)}`;

describe('Wallet top-ups, loyalty on refunds, exchanges, supplier cash approval', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let posting: AccountingPostingService;
  const PASSWORD = `Elt-${Date.now()}-pw!`;
  const run = Date.now().toString(36);
  const PIN = { manager: '2468', cashier: '1357', clerk: '8642' };
  const T = {
    id: '', sub: '', branchId: '', counterId: '', supplierId: '', bankGl: '', bankId: '', drawer: '', counter2Id: '', clerk: '', clerkId: '', clerkDrawer: '',
    cashier: '', manager: '', cashierId: '', managerId: '',
    A: '', B: '', C: '', // variants: A 200 (cost 120), B 450 (cost 300), C 100 (cost 60)
  };
  let acct: Awaited<ReturnType<AccountingPostingService['resolveAccounts']>>;

  const pace = () => new Promise((r) => setTimeout(r, 300));
  const hdr = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': T.sub, Host: 'localhost', 'x-pos-counter-id': T.counterId, ...extra });
  const post = async (token: string, url: string, body: unknown, extra: Record<string, string> = {}) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(token, extra)).send(body as object);
  };
  const approval = async () => {
    const r = await post(T.cashier, '/cash/manager-approval', { pin: PIN.manager });
    expect(r.status).toBe(201);
    return { 'x-cash-approval-token': r.body.data.approvalToken as string };
  };
  const line = (variantId: string, qty: number, price: number) => ({ variantId, productName: 'Item', variantName: 'Default', sku: 'S', quantity: qty, unitPrice: price, costPrice: 1 });
  const sell = async (items: object[], payments: object[], extra: object = {}) => {
    const r = await post(T.cashier, '/pos/sale', { items, payments, applyTierDiscount: false, ...extra });
    if (r.status !== 201) throw new Error(`sale ${r.status} ${JSON.stringify(r.body?.message)}`);
    await new Promise((res) => setTimeout(res, 500));
    return r.body.data as { id: string; total: number; pointsEarned: number; pointsRedeemed: number };
  };
  async function journal(referenceType: string, id: string, fallback?: () => Promise<unknown>) {
    for (let i = 0; i < 24; i++) {
      const je = await prisma.journalEntry.findFirst({ where: { tenantId: T.id, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
      if (je) return je;
      await new Promise((res) => setTimeout(res, 500));
    }
    if (fallback) await fallback();
    return prisma.journalEntry.findFirstOrThrow({ where: { tenantId: T.id, referenceType, referenceId: id, status: { not: 'VOID' } }, include: { lines: true } });
  }
  const sum = (je: Je, side: 'DEBIT' | 'CREDIT', account?: string) =>
    r2(je.lines.filter((l) => l.type === side && (!account || (side === 'DEBIT' ? l.debitAccountId : l.creditAccountId) === account)).reduce((s, l) => s + l.amount, 0));
  const balanced = (je: Je) => expect(sum(je, 'DEBIT')).toBe(sum(je, 'CREDIT'));
  const drawerCash = async (registerId?: string) => {
    const reg = await prisma.cashRegister.findUniqueOrThrow({ where: { id: registerId ?? T.drawer }, include: { movements: true } });
    let x = reg.openingCash;
    for (const m of reg.movements) {
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

    const sub = `elt${run}`;
    const t = await prisma.tenant.create({ data: { name: 'ELT shop', subdomain: sub, shopType: 'CLOTHING', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: 'WH-ELT', isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      const ps = [];
      for (const k of keys) {
        const [resource, action] = k.split(':');
        ps.push(await prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } }));
      }
      return prisma.role.create({ data: { tenantId: t.id, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const cashierKeys = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read', 'customers:read', 'customers:update', 'inventory:read',
      'suppliers:read', 'suppliers:update', 'returns:create', 'purchases:create', 'purchases:update', 'purchases:read'];
    const cashierRole = await role('Cashier', RoleType.CASHIER, cashierKeys);
    const managerRole = await role('Manager', RoleType.BRANCH_MANAGER, PERMISSION_CATALOGUE);
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = async (who: string, roleId: string, pin: string) => prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `${who}-${run}@elt.test`, passwordHash: hash, firstName: who, lastName: 'ELT', status: 'ACTIVE', emailVerified: true, posPinHash: await hashPosPin(pin), roles: { create: { roleId } } },
    });
    const cashier = await mk('cashier', cashierRole.id, PIN.cashier);
    const manager = await mk('manager', managerRole.id, PIN.manager);
    // Inventory manager: allowed to set GRN cost / price / MRP (canEditGrnPricing), with the cashier's own permissions.
    const clerkRole = await role('Inventory', RoleType.INVENTORY_MANAGER, cashierKeys);
    const clerk = await mk('clerk', clerkRole.id, PIN.clerk);
    const counter2 = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 2', code: 'C2' } });
    const product = async (code: string, price: number, cost: number) => {
      const p = await prisma.product.create({
        data: { tenantId: t.id, name: `Shirt ${code}`, slug: `shirt-${code}-${run}`, sku: `S${code}-${run}`, sellingPrice: price, costPrice: cost, mrp: price + 50, status: 'ACTIVE',
          variants: { create: { sku: `S${code}-${run}-V`, name: 'Default', sellingPrice: price, costPrice: cost, mrp: price + 50 } } },
        include: { variants: true },
      });
      await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: p.variants[0].id, quantity: 200 } });
      return p.variants[0].id;
    };
    acct = await posting.resolveAccounts(t.id);
    const gl = await prisma.account.create({ data: { tenantId: t.id, code: `1298${run.slice(-3)}`, name: 'Sampath (QR)', type: 'ASSET' } });
    const bank = await prisma.bankAccount.create({ data: { tenantId: t.id, code: 'BNK-QR', name: 'QR bank', glAccountId: gl.id } });
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: 'Textile Co', phone: '0771234567' } });
    const sign = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    Object.assign(T, {
      id: t.id, sub, branchId: branch.id, counterId: counter.id, supplierId: supplier.id, bankGl: gl.id, bankId: bank.id,
      cashierId: cashier.id, managerId: manager.id, clerkId: clerk.id, counter2Id: counter2.id,
      A: await product('A', 200, 120), B: await product('B', 450, 300), C: await product('C', 100, 60),
      cashier: await sign(cashier.email), manager: await sign(manager.email), clerk: await sign(clerk.email),
    });
    const open = await post(T.cashier, '/cash/open', { openingCash: 20000, counterId: T.counterId });
    expect(open.status).toBe(201);
    T.drawer = open.body.data.id;
    const openClerk = await post(T.clerk, '/cash/open', { openingCash: 20000, counterId: T.counter2Id }, { 'x-pos-counter-id': T.counter2Id });
    expect(openClerk.status).toBe(201);
    T.clerkDrawer = openClerk.body.data.id;
  });

  afterAll(async () => {
    // Background journal posting (outbox) must finish before the app and its DB connection close.
    for (let i = 0; i < 40; i++) {
      const busy = await prisma.accountingOutboxEvent.count({ where: { tenantId: T.id, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (!busy) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    await new Promise((res) => setTimeout(res, 1500));
    await app?.close();
  });

  // ── 1. Manual wallet top-ups ───────────────────────────────────────────
  describe('manual wallet top-ups', () => {
    let customerId = '';
    beforeAll(async () => {
      customerId = (await prisma.customer.create({ data: { tenantId: T.id, firstName: 'Ruwan', phone: `071${run.slice(-7)}` } })).id;
    });
    const topup = (body: object, extra: Record<string, string> = {}) => post(T.cashier, `/customers/${customerId}/wallet/topup`, body, extra);
    const wallet = async () => (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).walletBalance;

    it('needs a manager PIN approval, and a funded top-up needs the real payment method', async () => {
      const denied = await topup({ amount: 500, paymentMethod: 'CASH' });
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('MANAGER_APPROVAL_REQUIRED');
      expect((await topup({ amount: 500 }, await approval())).status).toBe(400); // no method
      expect((await topup({ amount: 500, paymentMethod: 'CARD' }, await approval())).status).toBe(400); // no last 4
      expect((await topup({ amount: 500, paymentMethod: 'QR' }, await approval())).status).toBe(400); // no bank
      expect((await topup({ amount: 500, kind: 'GOODWILL', paymentMethod: 'CASH' }, await approval())).status).toBe(400); // goodwill is not a payment
      expect(await wallet()).toBe(0);
    });

    it('cash: into the cashier drawer, Dr cashier wallet / Cr 2400; cashier is actor, manager authoriser', async () => {
      const before = await drawerCash();
      const r = await topup({ amount: 500, paymentMethod: 'CASH' }, await approval());
      expect(r.status).toBe(201);
      const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: r.body.data.transactionId } });
      expect(txn).toMatchObject({ type: 'TOPUP', paymentMethod: 'CASH', authorizedById: T.managerId, amount: 500 });
      expect(await drawerCash()).toBe(r2(before + 500));
      expect(await prisma.cashMovement.findFirst({ where: { reference: txn.id } })).toMatchObject({ type: 'SALE', createdById: T.cashierId, authorizedById: T.managerId });
      const je = await journal('WALLET_TOPUP', txn.id, () => posting.postWalletTopUp(txn.id, T.id));
      balanced(je);
      expect(sum(je, 'DEBIT', acct!.cashierWallet)).toBe(500);
      expect(sum(je, 'CREDIT', acct!.wallet)).toBe(500);
    });

    it('card: Dr card clearing; QR: Dr the bank it was paid into; never the drawer', async () => {
      const before = await drawerCash();
      const card = await topup({ amount: 300, paymentMethod: 'CARD', cardLast4: '4242' }, await approval());
      expect(card.status).toBe(201);
      const qr = await topup({ amount: 200, paymentMethod: 'QR', bankAccountId: T.bankId }, await approval());
      expect(qr.status).toBe(201);
      expect(await drawerCash()).toBe(before);
      const cj = await journal('WALLET_TOPUP', card.body.data.transactionId, () => posting.postWalletTopUp(card.body.data.transactionId, T.id));
      expect(sum(cj, 'DEBIT', acct!.card)).toBe(300);
      const qj = await journal('WALLET_TOPUP', qr.body.data.transactionId, () => posting.postWalletTopUp(qr.body.data.transactionId, T.id));
      expect(sum(qj, 'DEBIT', T.bankGl)).toBe(200);
      expect(sum(qj, 'CREDIT', acct!.wallet)).toBe(200);
    });

    it('goodwill credit: Dr Customer Goodwill Credits (5610) / Cr 2400 — never cash, no drawer movement', async () => {
      const before = await drawerCash();
      const g = await topup({ amount: 150, kind: 'GOODWILL', description: 'late delivery' }, await approval());
      expect(g.status).toBe(201);
      const txn = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: g.body.data.transactionId } });
      expect(txn).toMatchObject({ type: 'GOODWILL_CREDIT', paymentMethod: null, authorizedById: T.managerId });
      expect(await drawerCash()).toBe(before);
      expect(await prisma.cashMovement.count({ where: { reference: txn.id } })).toBe(0);
      const je = await journal('WALLET_TOPUP', txn.id, () => posting.postWalletTopUp(txn.id, T.id));
      const goodwill = await prisma.account.findFirstOrThrow({ where: { tenantId: T.id, code: '5610' } });
      expect(goodwill).toMatchObject({ type: 'EXPENSE', name: 'Customer Goodwill Credits' });
      expect(sum(je, 'DEBIT', goodwill.id)).toBe(150);
      expect(sum(je, 'DEBIT', acct!.cash)).toBe(0);
      expect(sum(je, 'DEBIT', acct!.cashierWallet)).toBe(0);
      expect(await wallet()).toBe(1150);
    });

    it('2400 equals the customer wallets after all top-ups', async () => {
      const lines = await prisma.journalLine.findMany({
        where: { journalEntry: { tenantId: T.id, status: { not: 'VOID' } }, OR: [{ debitAccountId: acct!.wallet }, { creditAccountId: acct!.wallet }] },
      });
      const gl = r2(lines.reduce((s, l) => s + (l.type === 'CREDIT' ? l.amount : -l.amount), 0));
      expect(gl).toBe(await wallet());
    });
  });

  // ── 2. Loyalty points on refunds ───────────────────────────────────────
  describe('loyalty points on refunds', () => {
    let customerId = '';
    const points = async () => (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).loyaltyPoints;
    const ledger = async () => {
      const rows = await prisma.loyaltyTransaction.findMany({ where: { customerId } });
      return rows.reduce((s, r) => s + r.points, 0);
    };
    beforeAll(async () => {
      customerId = (await prisma.customer.create({ data: { tenantId: T.id, firstName: 'Dilani', phone: `072${run.slice(-7)}`, loyaltyPoints: 100 } })).id;
      await prisma.loyaltyTransaction.create({ data: { customerId, tenantId: T.id, points: 100, type: 'MANUAL', description: 'opening points' } });
    });

    it('partial then full refund: earned points reversed and redeemed points restored proportionally; a duplicate changes nothing', async () => {
      // 5 × 200 = 1000, redeem 50 points (LKR 5) → due 995, earns 9 points
      const sale = await sell([line(T.A, 5, 200)], [{ method: 'CASH', amount: 995 }], { customerId, loyaltyPointsToRedeem: 50 });
      expect([sale.pointsEarned, sale.pointsRedeemed]).toEqual([9, 50]);
      expect(await points()).toBe(59);

      const r1 = await post(T.cashier, '/returns', { clientRequestId: rid(), originalSaleId: sale.id, reason: 'DEFECTIVE', items: [{ variantId: T.A, quantity: 2 }] });
      expect(r1.status).toBe(201);
      // 2/5 of the bill: reverse floor(9 × 0.4) = 3, restore floor(50 × 0.4) = 20
      expect(await points()).toBe(59 - 3 + 20);
      const rows1 = await prisma.loyaltyTransaction.findMany({ where: { referenceId: r1.body.data.id } });
      expect(rows1.map((r) => [r.type, r.points]).sort()).toEqual([['RETURN_RESTORE', 20], ['RETURN_REVERSAL', -3]]);

      const r2_ = await post(T.cashier, '/returns', { clientRequestId: rid(), originalSaleId: sale.id, reason: 'DEFECTIVE', items: [{ variantId: T.A, quantity: 3 }] });
      expect(r2_.status).toBe(201);
      // the rest: all 9 reversed, all 50 restored → back to the opening 100
      expect(await points()).toBe(100);
      expect(await ledger()).toBe(await points()); // balance = loyalty ledger

      const dup = await post(T.cashier, '/returns', { clientRequestId: rid(), originalSaleId: sale.id, reason: 'DEFECTIVE', items: [{ variantId: T.A, quantity: 1 }] });
      expect(dup.status).toBe(400);
      expect(await points()).toBe(100);
    });

    it('insufficient balance: never below zero, the unrecovered part is recorded', async () => {
      const sale = await sell([line(T.A, 5, 200)], [{ method: 'CASH', amount: 1000 }], { customerId }); // earns 10
      expect(await points()).toBe(110);
      // the customer spends points elsewhere, leaving 4
      await prisma.$transaction([
        prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: 4 } }),
        prisma.loyaltyTransaction.create({ data: { customerId, tenantId: T.id, points: -106, type: 'REDEEMED', description: 'spent elsewhere' } }),
      ]);
      const r = await post(T.cashier, '/returns', { clientRequestId: rid(), originalSaleId: sale.id, reason: 'DEFECTIVE', items: [{ variantId: T.A, quantity: 5 }] });
      expect(r.status).toBe(201);
      expect(await points()).toBe(0);
      const row = await prisma.loyaltyTransaction.findFirstOrThrow({ where: { referenceId: r.body.data.id, type: 'RETURN_REVERSAL' } });
      expect(row.points).toBe(-4);
      expect(row.description).toMatch(/6 could not be recovered/);
      expect(await ledger()).toBe(0);
    });
  });

  // ── 3. Exchanges ───────────────────────────────────────────────────────
  describe('exchanges (journal level)', () => {
    const exchange = (saleId: string, back: object[], out: object[], extra: object = {}) =>
      post(T.cashier, '/returns', { clientRequestId: rid(), originalSaleId: saleId, reason: 'SIZE_ISSUE', returnType: 'EXCHANGE', items: back, exchangeItems: out, ...extra });
    const postJe = (id: string) => journal('SALE_RETURN', id, () => posting.postReturn(id, T.id));

    it('equal value: goods swapped, no money line, no drawer movement; COGS / inventory for goods issued', async () => {
      const sale = await sell([line(T.A, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      const before = await drawerCash();
      const r = await exchange(sale.id, [{ variantId: T.A, quantity: 1 }], [{ variantId: T.C, quantity: 2 }]);
      expect(r.status).toBe(201);
      expect(r.body.data.exchangeSettlement).toMatchObject({ returned: 200, issued: 200, due: 0, excess: 0 });
      expect(await drawerCash()).toBe(before);
      expect(await prisma.cashMovement.count({ where: { reference: r.body.data.id } })).toBe(0);
      const je = await postJe(r.body.data.id);
      balanced(je);
      expect(sum(je, 'DEBIT', acct!.salesReturns)).toBe(200);
      expect(sum(je, 'CREDIT', acct!.sales)).toBe(200);
      for (const a of [acct!.cash, acct!.cashierWallet, acct!.card, acct!.bank, acct!.wallet]) {
        expect(sum(je, 'DEBIT', a)).toBe(0);
        expect(sum(je, 'CREDIT', a)).toBe(0);
      }
      expect(sum(je, 'DEBIT', acct!.cogs)).toBe(120); // 2 × C at 60
      expect(sum(je, 'CREDIT', acct!.inventory)).toBe(120 + 0);
    });

    it('customer owes: the difference is collected (cash with change into the drawer, or card); refused without payment', async () => {
      const sale = await sell([line(T.A, 2, 200)], [{ method: 'CASH', amount: 400 }]);
      const back = [{ variantId: T.A, quantity: 1 }];
      const out = [{ variantId: T.B, quantity: 1 }];
      expect((await exchange(sale.id, back, out)).status).toBe(400); // 250 due, nothing paid
      expect((await exchange(sale.id, back, out, { exchangePayments: [{ method: 'CARD', amount: 250 }] })).status).toBe(400); // no last 4

      const before = await drawerCash();
      const cash = await exchange(sale.id, back, out, { exchangePayments: [{ method: 'CASH', amount: 300 }] });
      expect(cash.status).toBe(201);
      expect(cash.body.data.exchangeSettlement).toMatchObject({ due: 250, change: 50, collected: [{ method: 'CASH', amount: 250 }] });
      expect(await drawerCash()).toBe(r2(before + 250));
      const je = await postJe(cash.body.data.id);
      balanced(je);
      expect(sum(je, 'DEBIT', acct!.cashierWallet)).toBe(250);
      expect(sum(je, 'DEBIT', acct!.salesReturns)).toBe(200);
      expect(sum(je, 'CREDIT', acct!.sales)).toBe(450);
      expect(sum(je, 'DEBIT', acct!.cogs)).toBe(300);

      const card = await exchange(sale.id, back, out, { exchangePayments: [{ method: 'CARD', amount: 250, cardLast4: '1881' }] });
      expect(card.status).toBe(201);
      const cj = await postJe(card.body.data.id);
      balanced(cj);
      expect(sum(cj, 'DEBIT', acct!.card)).toBe(250);
    });

    it('shop owes: the excess is refunded to the original tender, or given as store credit (Cr 2400)', async () => {
      const sale = await sell([line(T.B, 1, 450)], [{ method: 'CASH', amount: 450 }]);
      const before = await drawerCash();
      const refund = await exchange(sale.id, [{ variantId: T.B, quantity: 1 }], [{ variantId: T.A, quantity: 1 }]);
      expect(refund.status).toBe(201);
      expect(refund.body.data.exchangeSettlement).toMatchObject({ excess: 250, excessAs: 'REFUND' });
      expect(await drawerCash()).toBe(r2(before - 250));
      const rj = await postJe(refund.body.data.id);
      balanced(rj);
      expect(sum(rj, 'CREDIT', acct!.cashierWallet)).toBe(250);
      expect(sum(rj, 'CREDIT', acct!.sales)).toBe(200);

      const customerId = (await prisma.customer.create({ data: { tenantId: T.id, firstName: 'Saman', phone: `073${run.slice(-7)}` } })).id;
      const sale2 = await sell([line(T.B, 1, 450)], [{ method: 'CASH', amount: 450 }], { customerId });
      const anon = await sell([line(T.B, 1, 450)], [{ method: 'CASH', amount: 450 }]);
      expect((await exchange(anon.id, [{ variantId: T.B, quantity: 1 }], [{ variantId: T.A, quantity: 1 }], { exchangeExcessAs: 'STORE_CREDIT' })).status).toBe(400);
      const before2 = await drawerCash();
      const credit = await exchange(sale2.id, [{ variantId: T.B, quantity: 1 }], [{ variantId: T.A, quantity: 1 }], { exchangeExcessAs: 'STORE_CREDIT' });
      expect(credit.status).toBe(201);
      expect(await drawerCash()).toBe(before2);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).walletBalance).toBe(250);
      expect(await prisma.walletTransaction.count({ where: { referenceId: credit.body.data.id, type: 'EXCHANGE_CREDIT', amount: 250 } })).toBe(1);
      const cj = await postJe(credit.body.data.id);
      balanced(cj);
      expect(sum(cj, 'CREDIT', acct!.wallet)).toBe(250);
      expect(sum(cj, 'CREDIT', acct!.cashierWallet)).toBe(0);
    });
  });

  // ── 4. PO receive / Quick GRN with cash above the limit ────────────────
  describe('supplier cash on PO receive and Quick GRN', () => {
    it('Quick GRN: a Cashier receives at the product\'s EXISTING cost; cash above the limit needs a manager PIN; the cashier pays, the manager authorises', async () => {
      const body = { supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: 100 }], payment: { amount: 6000, method: 'CASH' } }; // no unitCost: 100 x 60 = 6,000
      const grnsBefore = await prisma.goodsReceipt.count({ where: { tenantId: T.id } });
      const stockBefore = (await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity;
      const denied = await post(T.cashier, '/procurement/grn/quick', body);
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('MANAGER_APPROVAL_REQUIRED');
      expect(await prisma.goodsReceipt.count({ where: { tenantId: T.id } })).toBe(grnsBefore);   // nothing received
      expect((await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity).toBe(stockBefore);
      const before = await drawerCash();
      const ok = await post(T.cashier, '/procurement/grn/quick', body, await approval());
      expect(ok.status).toBe(201);
      expect(await drawerCash()).toBe(r2(before - 6000));
      expect(await prisma.cashMovement.findFirst({ where: { registerId: T.drawer, type: 'EXPENSE', amount: 6000 }, orderBy: { createdAt: 'desc' } }))
        .toMatchObject({ createdById: T.cashierId, authorizedById: T.managerId });
      const newest = await prisma.goodsReceipt.findFirstOrThrow({ where: { tenantId: T.id }, orderBy: { createdAt: 'desc' }, include: { items: true } });
      const item = newest.items.find((i) => i.variantId === T.C)!;
      expect(item.unitCost).toBe(60);                                                              // the catalogue cost, set by the server
      expect((await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity).toBe(stockBefore + 100);
    });

    it('Quick GRN: sending the product\'s unchanged cost is not an edit (allowed); cash under the limit needs no approval', async () => {
      const r = await post(T.cashier, '/procurement/grn/quick', { supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: 5, unitCost: 60 }], payment: { amount: 300, method: 'CASH' } });
      expect(r.status).toBe(201);
    });

    it('GRN pricing: a Cashier cannot CHANGE cost (Quick GRN) or cost / selling price / MRP (direct GRN) — not even with a manager PIN approval; nothing is received', async () => {
      const grnsBefore = await prisma.goodsReceipt.count({ where: { tenantId: T.id } });
      const stockBefore = (await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity;
      const RESTRICTED = /requires an authorised inventory or finance role/;

      // Quick GRN: the only price field is unitCost, and only the EXISTING cost is open to a Cashier.
      const edited = { supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: 10, unitCost: 61 }], payment: { amount: 610, method: 'CASH' } };
      const q1 = await post(T.cashier, '/procurement/grn/quick', edited);
      expect(q1.status).toBe(403);
      expect(String(q1.body.message)).toMatch(RESTRICTED);
      const q2 = await post(T.cashier, '/procurement/grn/quick', edited, await approval());
      expect(q2.status).toBe(403); // a manager's approval authorises cash, it does not grant pricing rights
      expect(String(q2.body.message)).toMatch(RESTRICTED);
      const lower = await post(T.cashier, '/procurement/grn/quick', { ...edited, lines: [{ variantId: T.C, quantity: 10, unitCost: 1 }], payment: { amount: 10, method: 'CASH' } }, await approval());
      expect(lower.status).toBe(403);
      // Quick GRN has no selling price / MRP field at all: sending one is a validation error.
      for (const extra of [{ sellingPrice: 120 }, { mrp: 200 }]) {
        const r = await post(T.cashier, '/procurement/grn/quick', { ...edited, lines: [{ variantId: T.C, quantity: 10, ...extra }] });
        expect(r.status).toBe(400);
      }

      // Direct GRN: unitCost, sellingPrice and mrp are each restricted (a Cashier may not change any of them).
      const direct = (extra: object) => ({
        supplierId: T.supplierId,
        lines: [{ variantId: T.C, productName: 'Shirt C', variantName: 'Default', sku: 'SC', receivedQty: 10, unitCost: 60, ...extra }],
      });
      for (const extra of [{}, { sellingPrice: 120 }, { mrp: 200 }, { sellingPrice: 120, mrp: 200 }]) {
        const r = await post(T.cashier, '/procurement/grn/direct', direct(extra));
        expect([extra, r.status]).toEqual([extra, 403]);
        expect(String(r.body.message)).toMatch(RESTRICTED);
      }
      expect(await prisma.goodsReceipt.count({ where: { tenantId: T.id } })).toBe(grnsBefore);
      expect((await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity).toBe(stockBefore);

      // The authorised inventory manager may set all three on a direct GRN.
      const ok = await post(T.clerk, '/procurement/grn/direct', direct({ sellingPrice: 120, mrp: 200 }), { 'x-pos-counter-id': T.counter2Id });
      expect(ok.status).toBe(201);
      expect(await prisma.goodsReceipt.count({ where: { tenantId: T.id } })).toBe(grnsBefore + 1);
    });

    it('Quick GRN: a product with no purchase cost cannot be received by a Cashier (a manager must set the cost); the authorised role may enter one', async () => {
      const p = await prisma.product.create({
        data: { tenantId: T.id, name: `NoCost ${run}`, slug: `nocost-${run}`, sku: `NOC-${run}-P`, sellingPrice: 100, costPrice: 0, mrp: 150, status: 'ACTIVE',
          variants: { create: { sku: `NOC-${run}`, name: 'Default', sellingPrice: 100, costPrice: 0, mrp: 150 } } },
        include: { variants: true },
      });
      const variantId = p.variants[0].id;
      const grns = await prisma.goodsReceipt.count({ where: { tenantId: T.id } });
      const noCost = await post(T.cashier, '/procurement/grn/quick', { supplierId: T.supplierId, lines: [{ variantId, quantity: 3 }] });
      expect(noCost.status).toBe(400);
      expect(String(noCost.body.message)).toMatch(/no purchase cost yet — ask a manager/);
      expect((await post(T.cashier, '/procurement/grn/quick', { supplierId: T.supplierId, lines: [{ variantId, quantity: 3, unitCost: 40 }] })).status).toBe(403);
      expect(await prisma.goodsReceipt.count({ where: { tenantId: T.id } })).toBe(grns);
      const clerk = await post(T.clerk, '/procurement/grn/quick', { supplierId: T.supplierId, lines: [{ variantId, quantity: 3, unitCost: 40 }] }, { 'x-pos-counter-id': T.counter2Id });
      expect(clerk.status).toBe(201);
    });

    it('Quick GRN by an authorised inventory manager: received and paid from their own drawer; self-authorised (acting manager role)', async () => {
      const body = { supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: 100, unitCost: 60 }], payment: { amount: 6000, method: 'CASH' } };
      const before = await drawerCash(T.clerkDrawer);
      const ok = await post(T.clerk, '/procurement/grn/quick', body, { 'x-pos-counter-id': T.counter2Id });
      expect(ok.status).toBe(201);
      expect(await drawerCash(T.clerkDrawer)).toBe(r2(before - 6000));
      expect(await prisma.cashMovement.findFirst({ where: { registerId: T.clerkDrawer, type: 'EXPENSE', amount: 6000 }, orderBy: { createdAt: 'desc' } }))
        .toMatchObject({ createdById: T.clerkId });
    });

    it('PO receive with payment: same rule, the cashier stays the payer', async () => {
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: T.id, branchId: T.branchId, supplierId: T.supplierId, poNumber: `PO-${run}`, status: 'CONFIRMED', subtotal: 6000, total: 6000,
          items: { create: [{ variantId: T.C, productName: 'Shirt C', variantName: 'Default', sku: 'SC', orderedQty: 100, unitCost: 60, total: 6000 }] },
        },
        include: { items: true },
      });
      const body = { items: [{ itemId: po.items[0].id, receivedQty: 100 }], payment: { amount: 6000, method: 'CASH' } };
      const denied = await post(T.cashier, `/purchases/${po.id}/receive`, body);
      expect(denied.status).toBe(403);
      expect(await prisma.goodsReceipt.count({ where: { purchaseId: po.id } })).toBe(0);
      const ok = await post(T.cashier, `/purchases/${po.id}/receive`, body, await approval());
      expect(ok.status).toBe(201);
      expect(await prisma.goodsReceipt.count({ where: { purchaseId: po.id } })).toBe(1);
      expect(await prisma.cashMovement.findFirst({ where: { registerId: T.drawer, type: 'EXPENSE', amount: 6000 }, orderBy: { createdAt: 'desc' } }))
        .toMatchObject({ createdById: T.cashierId, authorizedById: T.managerId });
    });
  });

  // ── 5. Goods receipt + payment are all-or-nothing ──────────────────────
  describe('goods receipt and its supplier payment are atomic', () => {
    /** Everything a goods receipt or a supplier payment writes, for this shop. */
    const snapshot = async () => ({
      grns: await prisma.goodsReceipt.count({ where: { tenantId: T.id } }),
      stockC: (await prisma.inventory.findFirstOrThrow({ where: { tenantId: T.id, variantId: T.C } })).quantity,
      invoices: await prisma.supplierInvoice.count({ where: { tenantId: T.id } }),
      payments: await prisma.supplierPayment.count({ where: { tenantId: T.id } }),
      ledger: await prisma.supplierLedgerEntry.count({ where: { tenantId: T.id } }),
      supplierBalance: (await prisma.supplier.findUniqueOrThrow({ where: { id: T.supplierId } })).balance,
      movements: await prisma.cashMovement.count({ where: { registerId: T.clerkDrawer } }),
      drawer: await drawerCash(T.clerkDrawer),
    });
    /** Brings the drawer to exactly `target` (test setup only). */
    const setDrawer = async (target: number) => {
      const cur = await drawerCash(T.clerkDrawer);
      if (cur > target) await prisma.cashMovement.create({ data: { tenantId: T.id, registerId: T.clerkDrawer, type: 'WITHDRAWAL', amount: r2(cur - target), description: 'test reset' } });
      if (cur < target) await prisma.cashMovement.create({ data: { tenantId: T.id, registerId: T.clerkDrawer, type: 'DEPOSIT', amount: r2(target - cur), description: 'test reset' } });
      expect(await drawerCash(T.clerkDrawer)).toBe(target);
    };
    const quickGrn = (payment: object, qty = 10) =>
      post(T.clerk, '/procurement/grn/quick', { supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: qty, unitCost: 60 }], payment }, { 'x-pos-counter-id': T.counter2Id });

    it('Quick GRN paying more cash than the drawer holds: refused before anything is posted', async () => {
      await setDrawer(400);
      const before = await snapshot();
      const r = await quickGrn({ amount: 600, method: 'CASH' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/Not enough cash in your drawer/);
      expect(await snapshot()).toEqual(before);
    });

    it('a payment that fails INSIDE the transaction rolls the whole GRN back (stock, invoice, ledger)', async () => {
      await setDrawer(5000);
      const before = await snapshot();
      // passes the pre-checks; refused by the payment step itself (cheque without a due date)
      const r = await quickGrn({ amount: 600, method: 'CHEQUE', chequeNumber: '000123' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/due date/i);
      expect(await snapshot()).toEqual(before);
    });

    it('PO receive with an invalid payment (more than the receipt is worth): nothing received, PO unchanged', async () => {
      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId: T.id, branchId: T.branchId, supplierId: T.supplierId, poNumber: `PO2-${run}`, status: 'CONFIRMED', subtotal: 600, total: 600,
          items: { create: [{ variantId: T.C, productName: 'Shirt C', variantName: 'Default', sku: 'SC', orderedQty: 10, unitCost: 60, total: 600 }] },
        },
        include: { items: true },
      });
      const before = await snapshot();
      const r = await post(T.cashier, `/purchases/${po.id}/receive`, { items: [{ itemId: po.items[0].id, receivedQty: 10 }], payment: { amount: 900, method: 'CASH' } });
      expect(r.status).toBe(400);
      expect(await snapshot()).toEqual(before);
      const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
      expect(after.status).toBe('CONFIRMED');
      expect(after.items[0].receivedQty).toBe(0);
      // a valid payment with the receipt still works, and both land together
      const ok = await post(T.cashier, `/purchases/${po.id}/receive`, { items: [{ itemId: po.items[0].id, receivedQty: 10 }], payment: { amount: 600, method: 'CASH' } });
      expect(ok.status).toBe(201);
      expect(await prisma.goodsReceipt.count({ where: { purchaseId: po.id } })).toBe(1);
      expect(await prisma.supplierPayment.count({ where: { tenantId: T.id, purchaseId: po.id } })).toBe(1);
    });

    it('two concurrent Quick GRNs each paying the whole drawer: exactly one is received and paid', async () => {
      await setDrawer(600);
      const before = await snapshot();
      await pace();
      const send = () => request(app.getHttpServer()).post('/api/v1/procurement/grn/quick').set(hdr(T.clerk, { 'x-pos-counter-id': T.counter2Id }))
        .send({ supplierId: T.supplierId, lines: [{ variantId: T.C, quantity: 10, unitCost: 60 }], payment: { amount: 600, method: 'CASH' } });
      const [a, b] = await Promise.all([send(), send()]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      const after = await snapshot();
      expect(after.grns).toBe(before.grns + 1);
      expect(after.stockC).toBe(before.stockC + 10);
      expect(after.payments).toBe(before.payments + 1);
      expect(after.drawer).toBe(0);
    });
  });
});
