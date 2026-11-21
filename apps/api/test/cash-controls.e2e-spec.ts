/**
 * Cash controls (Nov 2026 audit follow-up), over HTTP on the full AppModule against PostgreSQL + Redis:
 * PIN identity vs terminal login, manager PIN approval, safe transfers, expense / supplier cash outflows
 * (locks, balance, concurrency), checkout without stray wallets, split-payment refunds, card numbers
 * in references, tenant / branch isolation.
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
import { hashPosPin } from '../src/modules/pos/pos-pin.helper';
import Redis from 'ioredis';

jest.setTimeout(300_000);

const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read', 'customers:read', 'inventory:read', 'suppliers:read', 'suppliers:update', 'returns:create'];
const MANAGER_PERMS = [...CASHIER_PERMS, 'cash:update', 'accounting:read'];
const PAN = '4111 1111 1111 1111';

type Shop = {
  id: string; sub: string; branchId: string; counterId: string; counter2Id: string; supplierId: string; bankId: string;
  variantId: string; productName: string; price: number;
  manager: string; cashier: string; cashier3: string; managerId: string; cashierId: string; cashier3Id: string; manager2Id: string;
};

let __retSeq = 0;
const rid = () => `e2e-ret-${Date.now().toString(36)}-${(__retSeq++).toString(36)}`;

describe('Cash controls: PIN identity, approvals, outflows, refunds, references', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `Cc-${Date.now()}-pw!`;
  let passwordHash = '';
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  const PIN = { manager: '2468', cashier: '1357', manager2: '9753', cashier3: '8642' };

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', ...extra });
  const post = async (s: Shop, token: string, url: string, body: unknown, extra: Record<string, string> = {}) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s, token, extra)).send(body as object);
  };

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `cc${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `CC ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const branch2 = await prisma.branch.create({ data: { tenantId: t.id, name: 'Second', code: 'SEC' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const counter2 = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 2', code: 'C2' } });
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      // One at a time: a burst of ~100 parallel connections is dropped by the local VM port forward.
      const ps = [];
      for (const k of keys) {
        const [resource, action] = k.split(':');
        ps.push(await prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } }));
      }
      return prisma.role.create({ data: { tenantId: t.id, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    await role('Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const cashierRole = await role('Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const managerRole = await role('Manager', RoleType.BRANCH_MANAGER, MANAGER_PERMS);
    const mk = async (who: string, roleId: string, pin: string, branchId = branch.id) => prisma.user.create({
      data: {
        tenantId: t.id, branchId, email: `${who}-${run}@cc${label}.test`, passwordHash, firstName: who, lastName: label.toUpperCase(),
        status: 'ACTIVE', emailVerified: true, posPinHash: await hashPosPin(pin), roles: { create: { roleId } },
      },
    });
    const manager = await mk('manager', managerRole.id, PIN.manager);
    const cashier = await mk('cashier', cashierRole.id, PIN.cashier);
    const cashier3 = await mk('cashier3', cashierRole.id, PIN.cashier3);
    const manager2 = await mk('manager2', managerRole.id, PIN.manager2, branch2.id);
    const sign = async (u: { email: string }) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: u.email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${u.email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const supplier = await prisma.supplier.create({ data: { tenantId: t.id, name: `Supplier ${label}`, phone: '0770000000' } });
    // An outstanding bill, so supplier payments have something to apply to.
    await prisma.supplierInvoice.create({ data: { tenantId: t.id, supplierId: supplier.id, invoiceNumber: `SI-${label}-${run}`, subtotal: 100000, total: 100000, status: 'POSTED' } });
    const bank = await prisma.bankAccount.create({ data: { tenantId: t.id, code: `BNK-${label}`, name: `Bank ${label}` } });
    const price = 200;
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Tea ${label}`, slug: `tea-cc-${label}-${run}`, sku: `TCC-${label}-${run}`, sellingPrice: price, costPrice: 150, mrp: 220, status: 'ACTIVE',
        variants: { create: { sku: `TCC-${label}-${run}-V`, name: 'Default', sellingPrice: price, costPrice: 150, mrp: 220 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 500 } });
    return {
      id: t.id, sub, branchId: branch.id, counterId: counter.id, counter2Id: counter2.id, supplierId: supplier.id, bankId: bank.id,
      variantId: product.variants[0].id, productName: product.name, price,
      manager: await sign(manager), cashier: await sign(cashier), cashier3: await sign(cashier3),
      managerId: manager.id, cashierId: cashier.id, cashier3Id: cashier3.id, manager2Id: manager2.id,
    };
  }

  /** One API instance (each has its own process memory and its own Redis connection). */
  async function makeApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const a = moduleFixture.createNestApplication();
    a.setGlobalPrefix('api');
    a.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    a.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    a.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    a.useGlobalInterceptors(new ResponseInterceptor());
    await a.init();
    return { a, moduleFixture };
  }

  beforeAll(async () => {
    const made = await makeApp();
    app = made.a;
    const moduleFixture = made.moduleFixture;
    prisma = moduleFixture.get(PrismaService);
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });

  afterAll(async () => { await app?.close(); });

  // Drawer of the cashier on Counter 1 (opened with a float), and helpers
  let drawer = '';
  let pinCashier = '';
  const available = async (id = drawer) => {
    const r = await prisma.cashRegister.findUnique({ where: { id }, include: { movements: true } });
    let x = r!.openingCash;
    for (const m of r!.movements) {
      if (['SALE', 'DEPOSIT', 'PAYMENT'].includes(m.type)) x += m.amount;
      if (['EXPENSE', 'REFUND', 'WITHDRAWAL'].includes(m.type)) x -= m.amount;
    }
    return Math.round(x * 100) / 100;
  };
  const setBalance = async (target: number) => {
    const cur = await available();
    if (cur < target) expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: Math.round((target - cur) * 100) / 100 })).status).toBe(201);
    if (cur > target) await prisma.cashMovement.create({ data: { tenantId: A.id, registerId: drawer, type: 'WITHDRAWAL', amount: Math.round((cur - target) * 100) / 100, description: 'test reset' } });
    expect(await available()).toBe(target);
  };
  const approval = async (pin: string, terminal = A.manager, s = A) => {
    const r = await post(s, terminal, '/cash/manager-approval', { pin });
    return { status: r.status, token: r.body?.data?.approvalToken as string | undefined };
  };

  describe('1. PIN identity and manager approval', () => {
    beforeAll(async () => {
      const open = await post(A, A.cashier, '/cash/open', { openingCash: 9000, counterId: A.counterId });
      expect(open.status).toBe(201);
      drawer = open.body.data.id;
      const unlock = await post(A, A.manager, '/pos/pin/unlock', { pin: PIN.cashier });
      expect(unlock.status).toBe(201);
      pinCashier = unlock.body.data.unlockToken;
    });

    it('a PIN cashier on a manager-logged terminal is the cashier: no manager authority, recorded as the cashier', async () => {
      const big = await post(A, A.manager, `/cash/${drawer}/movements`, { type: 'WITHDRAWAL', amount: 5500 }, { 'x-pos-cashier-token': pinCashier });
      expect(big.status).toBe(403);
      expect(big.body.error).toBe('MANAGER_APPROVAL_REQUIRED'); // the POS answers this with the manager PIN dialog
      const small = await post(A, A.manager, `/cash/${drawer}/movements`, { type: 'WITHDRAWAL', amount: 100 }, { 'x-pos-cashier-token': pinCashier });
      expect(small.status).toBe(201);
      const m = await prisma.cashMovement.findFirst({ where: { registerId: drawer, type: 'WITHDRAWAL', amount: 100 }, orderBy: { createdAt: 'desc' } });
      expect(m).toMatchObject({ createdById: A.cashierId, authorizedById: null });
    });

    it('explicit manager PIN approval authorises it; cashier is creator, manager is authoriser', async () => {
      expect((await approval('0000')).status).toBe(403);
      expect((await approval(PIN.cashier)).status).toBe(403); // a cashier's PIN is not a manager approval
      const ok = await approval(PIN.manager, A.cashier);
      expect(ok.status).toBe(201);
      const r = await post(A, A.manager, `/cash/${drawer}/movements`, { type: 'WITHDRAWAL', amount: 5500 }, { 'x-pos-cashier-token': pinCashier, 'x-cash-approval-token': ok.token! });
      expect(r.status).toBe(201);
      const m = await prisma.cashMovement.findFirst({ where: { registerId: drawer, amount: 5500 } });
      expect(m).toMatchObject({ createdById: A.cashierId, authorizedById: A.managerId });
    });

    it('safe transfers: cashier tops up own drawer up to the limit; more, or another drawer, needs approval', async () => {
      const own = await post(A, A.cashier, '/cash/transfer', { toRegisterId: drawer, amount: 100, from: 'SAFE' });
      expect(own.status).toBe(201);
      expect((await post(A, A.cashier, '/cash/transfer', { toRegisterId: drawer, amount: 6000, from: 'SAFE' })).status).toBe(403);
      const ok = await approval(PIN.manager);
      const approved = await post(A, A.cashier, '/cash/transfer', { toRegisterId: drawer, amount: 6000, from: 'SAFE' }, { 'x-cash-approval-token': ok.token! });
      expect(approved.status).toBe(201);
      expect(await prisma.cashMovement.findFirst({ where: { registerId: drawer, amount: 6000, type: 'DEPOSIT' } })).toMatchObject({ createdById: A.cashierId, authorizedById: A.managerId });
    });

    it('approval from another shop or another branch gives no authority', async () => {
      const other = await approval(PIN.manager, B.manager, B);
      expect(other.status).toBe(201);
      expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'WITHDRAWAL', amount: 5500 }, { 'x-cash-approval-token': other.token! })).status).toBe(403);
      // manager2 belongs to branch 2: their PIN is not accepted at a branch-1 terminal
      expect((await approval(PIN.manager2)).status).toBe(403);
    });

    it('a handover difference above the limit needs a real approval, not the terminal login', async () => {
      const unlock3 = await post(A, A.manager, '/pos/pin/unlock', { pin: PIN.cashier3 });
      const tok3 = unlock3.body.data.unlockToken;
      // Variance reason is validated first: without one the handover is a 400 (nothing handed over) ...
      const noReason = await post(A, A.manager, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 100 }, { 'x-pos-cashier-token': tok3 });
      expect(noReason.status).toBe(400);
      expect(String(noReason.body.message)).toMatch(/reason for the cash handover difference/);
      // ... and with a reason the large difference still needs a real approval, not the terminal login.
      const denied = await post(A, A.manager, '/cash/open', { openingCash: 0, counterId: A.counterId, countedCash: 100, reason: 'Counted short at handover' }, { 'x-pos-cashier-token': tok3 });
      expect(denied.status).toBe(403);
      expect(await prisma.cashRegister.count({ where: { id: drawer, clearedAt: null } })).toBe(1); // nothing handed over
    });
  });

  describe('2/3. Expense and supplier cash outflows', () => {
    it('expense above the drawer balance is refused and nothing is saved', async () => {
      await setBalance(1000);
      const before = await prisma.expense.count({ where: { tenantId: A.id } });
      const r = await post(A, A.cashier, '/accounting/expenses', { amount: 1500, description: 'tea', date: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH' });
      expect(r.status).toBe(400);
      expect(await prisma.expense.count({ where: { tenantId: A.id } })).toBe(before);
      expect(await available()).toBe(1000);
    });

    it('two concurrent expenses of the whole balance: exactly one succeeds', async () => {
      await setBalance(800);
      const body = { amount: 800, description: 'race', date: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH' };
      await pace();
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/accounting/expenses').set(hdr(A, A.cashier)).send(body),
        request(app.getHttpServer()).post('/api/v1/accounting/expenses').set(hdr(A, A.cashier)).send(body),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 400]);
      expect(await available()).toBe(0);
      expect(await prisma.expense.count({ where: { tenantId: A.id, description: 'race' } })).toBe(1);
    });

    it('expense identity: a PIN cashier is the creator, the terminal manager is not', async () => {
      await setBalance(500);
      const r = await post(A, A.manager, '/accounting/expenses', { amount: 50, description: 'pin expense', date: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH' }, { 'x-pos-cashier-token': pinCashier });
      expect(r.status).toBe(201);
      expect(await prisma.expense.findFirst({ where: { tenantId: A.id, description: 'pin expense' } })).toMatchObject({ createdBy: A.cashierId });
    });

    it('supplier cash payment above the drawer balance is refused; concurrent payments cannot overdraw', async () => {
      await setBalance(700);
      expect((await post(A, A.cashier, `/suppliers/${A.supplierId}/ap/payment`, { amount: 900, method: 'CASH' })).status).toBe(400);
      await pace();
      const body = { amount: 700, method: 'CASH' };
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post(`/api/v1/suppliers/${A.supplierId}/ap/payment`).set(hdr(A, A.cashier)).send(body),
        request(app.getHttpServer()).post(`/api/v1/suppliers/${A.supplierId}/ap/payment`).set(hdr(A, A.cashier)).send(body),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 400]);
      expect(await available()).toBe(0);
    });

    it('supplier cash payment above the limit needs a manager PIN approval; the cashier stays the payer', async () => {
      await setBalance(6000);
      const denied = await post(A, A.cashier, `/suppliers/${A.supplierId}/ap/payment`, { amount: 5500, method: 'CASH' });
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe('MANAGER_APPROVAL_REQUIRED');
      // a manager-logged terminal with a PIN cashier is still the cashier
      expect((await post(A, A.manager, `/suppliers/${A.supplierId}/ap/payment`, { amount: 5500, method: 'CASH' }, { 'x-pos-cashier-token': pinCashier })).status).toBe(403);
      expect(await available()).toBe(6000);
      const ok = await approval(PIN.manager);
      const paid = await post(A, A.manager, `/suppliers/${A.supplierId}/ap/payment`, { amount: 5500, method: 'CASH' }, { 'x-pos-cashier-token': pinCashier, 'x-cash-approval-token': ok.token! });
      expect(paid.status).toBe(201);
      expect(await available()).toBe(500);
      const m = await prisma.cashMovement.findFirst({ where: { registerId: drawer, type: 'EXPENSE', amount: 5500 }, orderBy: { createdAt: 'desc' } });
      expect(m).toMatchObject({ createdById: A.cashierId, authorizedById: A.managerId });
    });
  });

  describe('4. Failed checkouts do not create cashier wallets', () => {
    const sale = (payments: object[], qty = 1, extra: object = {}) =>
      post(A, A.cashier3, '/pos/sale', {
        items: [{ variantId: A.variantId, productName: A.productName, variantName: 'Default', sku: 'T', quantity: qty, unitPrice: A.price, costPrice: 150 }],
        payments, applyTierDiscount: false, ...extra,
      }, { 'x-pos-counter-id': A.counter2Id });
    const wallets = () => prisma.cashRegister.count({ where: { tenantId: A.id, cashierId: A.cashier3Id } });

    it('refused checkouts leave no wallet; a valid one creates exactly one', async () => {
      expect(await wallets()).toBe(0);
      const bad = [
        await sale([{ method: 'CHEQUE', amount: A.price }]), // cheque without number
        await sale([{ method: 'QR', amount: A.price }]), // QR without bank account
        await post(A, A.cashier3, '/pos/sale', { // unknown product
          items: [{ variantId: 'missing-variant', productName: 'X', variantName: 'Default', sku: 'X', quantity: 1, unitPrice: 10, costPrice: 1 }],
          payments: [{ method: 'CASH', amount: 10 }], applyTierDiscount: false,
        }, { 'x-pos-counter-id': A.counter2Id }),
        await sale([{ method: 'CUSTOMER_CREDIT', amount: A.price }]), // credit without a customer
        await sale([{ method: 'CARD', amount: A.price, cardLast4: '12' }]), // bad card digits
        await sale([{ method: 'CASH', amount: 1 }]), // short payment
      ];
      expect(bad.map((r, i) => `#${i} ${r.status} ${JSON.stringify(r.body?.message ?? '').slice(0, 80)}`).filter((x) => !/^#\d+ 4/.test(x))).toEqual([]);
      expect(await wallets()).toBe(0);
      expect((await sale([{ method: 'CASH', amount: A.price }])).status).toBe(201);
      expect(await wallets()).toBe(1);
    });
  });

  describe('5. Refunds', () => {
    it('split card + cash sale: only the cash share leaves the drawer; refused when the drawer is short', async () => {
      await setBalance(1000);
      const s = await post(A, A.cashier, '/pos/sale', {
        items: [{ variantId: A.variantId, productName: A.productName, variantName: 'Default', sku: 'T', quantity: 1, unitPrice: A.price, costPrice: 150 }],
        payments: [{ method: 'CARD', amount: 100, cardLast4: '4242' }, { method: 'CASH', amount: 100 }], applyTierDiscount: false,
      }, { 'x-pos-counter-id': A.counterId });
      expect(s.status).toBe(201);
      await new Promise((r) => setTimeout(r, 800)); // sale cash movement is recorded right after the sale
      const ret = await post(A, A.cashier, '/returns', { clientRequestId: rid(), originalSaleId: s.body.data.id, reason: 'DEFECTIVE', items: [{ variantId: A.variantId, quantity: 1 }] }, { 'x-pos-counter-id': A.counterId });
      expect(ret.status).toBe(201);
      const refund = await prisma.cashMovement.findFirst({ where: { reference: ret.body.data.id, type: 'REFUND' } });
      expect(refund?.amount).toBe(100);
      expect(refund?.createdById).toBe(A.cashierId);

      // A cash sale, then drain the drawer: the refund is refused and no return is recorded.
      const cashSale = await post(A, A.cashier, '/pos/sale', {
        items: [{ variantId: A.variantId, productName: A.productName, variantName: 'Default', sku: 'T', quantity: 1, unitPrice: A.price, costPrice: 150 }],
        payments: [{ method: 'CASH', amount: A.price }], applyTierDiscount: false,
      }, { 'x-pos-counter-id': A.counterId });
      await new Promise((r) => setTimeout(r, 800));
      await setBalance(50);
      const before = await prisma.return.count({ where: { tenantId: A.id } });
      const short = await post(A, A.cashier, '/returns', { clientRequestId: rid(), originalSaleId: cashSale.body.data.id, reason: 'DEFECTIVE', items: [{ variantId: A.variantId, quantity: 1 }] }, { 'x-pos-counter-id': A.counterId });
      expect(short.status).toBe(400);
      expect(await prisma.return.count({ where: { tenantId: A.id } })).toBe(before);
      expect(await available()).toBe(50);
    });
  });

  describe('6. Card numbers in references', () => {
    it('refuses full card numbers in cash, expense, supplier and POS references; keeps bank references', async () => {
      await setBalance(500);
      expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: 1, reference: PAN })).status).toBe(400);
      expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: 1, description: `card ${PAN}` })).status).toBe(400);
      expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: 1, reference: 'R'.repeat(65) })).status).toBe(400);
      expect((await post(A, A.cashier, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: 1, reference: 'BANK-TXN-20261109-778812' })).status).toBe(201);
      expect((await post(A, A.cashier, '/accounting/expenses', { amount: 1, description: 'x', date: '2026-11-09', paymentMethod: 'CASH', reference: PAN })).status).toBe(400);
      expect((await post(A, A.cashier, '/accounting/expenses', { amount: 1, description: 'x', date: '2026-11-09', paymentMethod: 'CHEQUE', chequeNumber: '5555555555554444' })).status).toBe(400);
      expect((await post(A, A.cashier, `/suppliers/${A.supplierId}/ap/payment`, { amount: 1, method: 'CASH', reference: PAN })).status).toBe(400);
      expect((await post(A, A.cashier, '/pos/sale', {
        items: [{ variantId: A.variantId, productName: A.productName, variantName: 'Default', sku: 'T', quantity: 1, unitPrice: A.price, costPrice: 150 }],
        payments: [{ method: 'BANK_TRANSFER', amount: A.price, bankAccountId: A.bankId, reference: PAN }], applyTierDiscount: false,
      }, { 'x-pos-counter-id': A.counterId })).status).toBe(400);
      expect(await prisma.cashMovement.count({ where: { tenantId: A.id, OR: [{ reference: { contains: '4111' } }, { description: { contains: '4111' } }] } })).toBe(0);
    });
  });

  describe('Manager PIN lockout shared through Redis (two API instances)', () => {
    let app2: INestApplication;
    beforeAll(async () => { app2 = (await makeApp()).a; });
    afterAll(async () => { await app2?.close(); });
    const approveOn = async (which: INestApplication, s: Shop, terminal: string, pin: string) => {
      await pace();
      return request(which.getHttpServer()).post('/api/v1/cash/manager-approval').set(hdr(s, terminal)).send({ pin });
    };

    it('5 wrong PINs spread over two instances lock the terminal on both; the right PIN is refused while locked', async () => {
      const unknown = await approveOn(app, A, A.cashier3, '0000');
      const cashierPin = await approveOn(app2, A, A.cashier3, PIN.cashier);
      // Same answer whether nobody or a non-manager has the PIN: no account enumeration.
      expect([unknown.status, cashierPin.status]).toEqual([403, 403]);
      expect(cashierPin.body.message).toBe(unknown.body.message);
      expect(cashierPin.body.error).toBe('PIN_REJECTED');
      expect((await approveOn(app, A, A.cashier3, '1111')).status).toBe(403);
      expect((await approveOn(app2, A, A.cashier3, '2222')).status).toBe(403);
      expect((await approveOn(app, A, A.cashier3, '3333')).status).toBe(403);
      for (const which of [app, app2]) {
        const locked = await approveOn(which, A, A.cashier3, PIN.manager);
        expect(locked.status).toBe(429);
        expect(locked.body.error).toBe('PIN_LOCKED');
        expect(locked.body.message).toMatch(/locked on this terminal for 1[45] more minute/);
      }
      // Another terminal of the same shop is not locked.
      expect((await approveOn(app2, A, A.cashier, PIN.manager)).status).toBe(201);
    });

    it('parallel wrong PINs on both instances: at most 5 are checked, then locked', async () => {
      await new Promise((r) => setTimeout(r, 1100));
      const all = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        request((i % 2 ? app2 : app).getHttpServer()).post('/api/v1/cash/manager-approval').set(hdr(B, B.cashier3)).send({ pin: `0${i}0${i}` })));
      const rejected = all.filter((r) => r.status === 403).length;
      const locked = all.filter((r) => r.status === 429 && r.body.error === 'PIN_LOCKED').length;
      expect(rejected).toBeLessThanOrEqual(5);
      expect(rejected + locked).toBe(8);
      expect((await approveOn(app, B, B.cashier3, PIN.manager)).status).toBe(429);
    });

    it('PIN set never reveals whose PIN a code is', async () => {
      const r = await post(A, A.cashier3, '/pos/pin/set', { pin: PIN.manager });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('This PIN cannot be used. Choose a different 4-digit PIN.');
      expect(JSON.stringify(r.body)).not.toMatch(/manager/i);
    });

    it('PIN unlock is rate-limited per terminal; your own correct PIN does not reset the count', async () => {
      const unlock = (which: INestApplication, pin: string) => {
        return pace().then(() => request(which.getHttpServer()).post('/api/v1/pos/pin/unlock').set(hdr(B, B.cashier)).send({ pin }));
      };
      for (let i = 0; i < 9; i++) expect((await unlock(i % 2 ? app2 : app, `55${i}5`)).status).toBe(400);
      expect((await unlock(app, PIN.cashier)).status).toBe(201); // own PIN: allowed, counter NOT cleared
      expect((await unlock(app2, '5595')).status).toBe(400); // 10th wrong → locked
      const locked = await unlock(app, PIN.manager);
      expect(locked.status).toBe(429);
      expect(locked.body.error).toBe('PIN_LOCKED');
    });

    it('neither Redis nor the audit log holds a PIN or an approval token', async () => {
      const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, lazyConnect: true });
      try {
        await redis.connect();
        const keys = await redis.keys(`*cash-approval-pin:*${A.id}*`);
        expect(keys.length).toBeGreaterThan(0);
        for (const k of keys) {
          expect(k).not.toMatch(new RegExp(`${PIN.manager}|${PIN.cashier}`));
          expect(['0', '1', '2', '3', '4', '5', null]).toContain(await redis.get(k)); // counters only (0 after a correct PIN gave its attempt back)
        }
      } finally {
        redis.disconnect();
      }
      await new Promise((r) => setTimeout(r, 800)); // audit rows are written after the response
      const rows = await prisma.auditLog.findMany({ where: { tenantId: A.id }, select: { newData: true } });
      const text = JSON.stringify(rows);
      expect(text).toContain('[redacted]');
      for (const pin of Object.values(PIN)) expect(text).not.toContain(`"pin":"${pin}"`);
      expect(text).not.toMatch(/approvalToken":"[A-Za-z0-9_-]+\./);
    });
  });

  describe('Isolation', () => {
    it("another shop's users cannot move or approve on this shop's drawer", async () => {
      expect((await post(B, B.manager, `/cash/${drawer}/movements`, { type: 'DEPOSIT', amount: 1 })).status).toBe(404);
      expect((await post(B, B.manager, '/cash/transfer', { toRegisterId: drawer, amount: 1, from: 'SAFE' })).status).toBe(404);
    });
  });
});
