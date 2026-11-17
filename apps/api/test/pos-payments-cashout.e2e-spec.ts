/**
 * Audit fixes H1 (every payment line validated, zero-amount lines, cross-shop bank / QR references,
 * reference length) and H2 (manual cash out: drawer lock, balance, manager authorisation, branch /
 * tenant scope), over HTTP on the full AppModule against PostgreSQL + Redis.
 * Needs DATABASE_URL (a TEST database) and REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { BankAccountType, RoleType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';

jest.setTimeout(300_000);

const CASHIER_PERMS = ['sales:create', 'sales:read', 'cash:create', 'cash:read', 'products:read', 'customers:read', 'inventory:read'];
const MANAGER_PERMS = ['sales:read', 'cash:read', 'cash:create', 'cash:update', 'products:read'];

type Shop = {
  id: string; sub: string; branchId: string; branch2Id: string; counterId: string; bankId: string; qrId: string;
  variantId: string; productName: string; price: number;
  admin: string; manager: string; manager2: string; cashier: string; cashier2: string; managerId: string; cashierId: string;
};

describe('Audit H1 / H2: payment lines and manual cash out', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = `H12-${Date.now()}-pw!`;
  let passwordHash = '';
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', ...extra });
  const post = async (s: Shop, token: string, url: string, body: unknown, extra: Record<string, string> = {}) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s, token, extra)).send(body as object);
  };

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `h12${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `H12 ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const branch2 = await prisma.branch.create({ data: { tenantId: t.id, name: 'Second', code: 'SEC' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WH-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const role = async (name: string, type: RoleType, keys: readonly string[]) => {
      const ps = await Promise.all(keys.map((k) => {
        const [resource, action] = k.split(':');
        return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
      }));
      return prisma.role.create({ data: { tenantId: t.id, name, type, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    };
    const adminRole = await role('Admin', RoleType.TENANT_ADMIN, PERMISSION_CATALOGUE);
    const cashierRole = await role('Cashier', RoleType.CASHIER, CASHIER_PERMS);
    const managerRole = await role('Manager', RoleType.BRANCH_MANAGER, MANAGER_PERMS);
    const mk = (who: string, roleId: string, branchId = branch.id) => prisma.user.create({
      data: { tenantId: t.id, branchId, email: `${who}-${run}@h12${label}.test`, passwordHash, firstName: who, lastName: label.toUpperCase(), status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } } },
    });
    const admin = await mk('admin', adminRole.id);
    const manager = await mk('manager', managerRole.id);
    const manager2 = await mk('manager2', managerRole.id, branch2.id);
    const cashier = await mk('cashier', cashierRole.id);
    const cashier2 = await mk('cashier2', cashierRole.id);
    const sign = async (u: { email: string }) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: u.email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${u.email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const bank = await prisma.bankAccount.create({ data: { tenantId: t.id, code: `BNK-${label}`, name: `Bank ${label}`, type: BankAccountType.CURRENT } });
    const qr = await prisma.paymentQrCode.create({ data: { tenantId: t.id, bankAccountId: bank.id, label: `QR ${label}`, imageUrl: '/uploads/x.png' } });
    const price = 200;
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Biscuit ${label}`, slug: `biscuit-${label}-${run}`, sku: `BIS-${label}-${run}`,
        sellingPrice: price, costPrice: 150, mrp: 220, status: 'ACTIVE',
        variants: { create: { sku: `BIS-${label}-${run}-V`, name: 'Default', sellingPrice: price, costPrice: 150, mrp: 220 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 500 } });
    return {
      id: t.id, sub, branchId: branch.id, branch2Id: branch2.id, counterId: counter.id, bankId: bank.id, qrId: qr.id,
      variantId: product.variants[0].id, productName: product.name, price,
      admin: await sign(admin), manager: await sign(manager), manager2: await sign(manager2), cashier: await sign(cashier), cashier2: await sign(cashier2),
      managerId: manager.id, cashierId: cashier.id,
    };
  }

  const sale = (s: Shop, payments: object[], extra: object = {}) =>
    post(s, s.cashier, '/pos/sale', {
      items: [{ variantId: s.variantId, productName: s.productName, variantName: 'Default', sku: 'BIS', quantity: 1, unitPrice: s.price, costPrice: 150 }],
      payments, applyTierDiscount: false, ...extra,
    }, { 'x-pos-counter-id': s.counterId });
  const saleCount = (s: Shop) => prisma.sale.count({ where: { tenantId: s.id } });

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
    passwordHash = await bcrypt.hash(PASSWORD, 10);
    A = await seed('a');
    B = await seed('b');
  });

  afterAll(async () => { await app?.close(); });

  // ── H1 ───────────────────────────────────────────────────────────────────
  describe('H1 payment lines', () => {
    it('1. zero-amount CARD with a full card number is refused; nothing is saved', async () => {
      const before = await saleCount(A);
      const r = await sale(A, [{ method: 'CASH', amount: A.price }, { method: 'CARD', amount: 0, reference: '4111111111111111' }]);
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(before);
      expect(await prisma.salePayment.count({ where: { reference: { contains: '411111111111' } } })).toBe(0);
    });

    it("2. zero-amount QR naming another shop's QR / bank is refused", async () => {
      const before = await saleCount(A);
      expect((await sale(A, [{ method: 'CASH', amount: A.price }, { method: 'QR', amount: 0, bankAccountId: B.bankId, qrCodeId: B.qrId }])).status).toBe(400);
      expect((await sale(A, [{ method: 'CASH', amount: A.price }, { method: 'QR', amount: 0, bankAccountId: A.bankId, qrCodeId: B.qrId }])).status).toBe(400);
      expect(await saleCount(A)).toBe(before);
      expect(await prisma.salePayment.count({ where: { qrCodeId: B.qrId, sale: { tenantId: A.id } } })).toBe(0);
    });

    it("3. zero-amount bank transfer naming another shop's bank account is refused", async () => {
      const before = await saleCount(A);
      expect((await sale(A, [{ method: 'CASH', amount: A.price }, { method: 'BANK_TRANSFER', amount: 0, bankAccountId: B.bankId }])).status).toBe(400);
      expect(await saleCount(A)).toBe(before);
      expect(await prisma.salePayment.count({ where: { bankAccountId: B.bankId, sale: { tenantId: A.id } } })).toBe(0);
    });

    it('4. invalid card last-four digits are refused', async () => {
      for (const c of [{ cardLast4: '123' }, { cardLast4: '12a4' }, { reference: '12345' }, {}]) {
        expect((await sale(A, [{ method: 'CARD', amount: A.price, ...c }])).status).toBe(400);
      }
    });

    it('5. references longer than 64 characters are refused', async () => {
      expect((await sale(A, [{ method: 'CASH', amount: A.price, reference: 'R'.repeat(65) }])).status).toBe(400);
      expect((await sale(A, [{ method: 'CASH', amount: A.price, reference: 'R'.repeat(64) }])).status).toBe(201);
    });

    it('6. normal cash, card and QR payments still work and store the right fields', async () => {
      const cash = await sale(A, [{ method: 'CASH', amount: 500 }]);
      expect(cash.status).toBe(201);
      expect(Number(cash.body.data.changeDue)).toBe(300);
      const card = await sale(A, [{ method: 'CARD', amount: A.price, cardLast4: '4242' }]);
      expect(card.status).toBe(201);
      expect(await prisma.salePayment.findFirst({ where: { saleId: card.body.data.id } })).toMatchObject({ method: 'CARD', cardLast4: '4242', reference: '4242' });
      const qr = await sale(A, [{ method: 'QR', amount: A.price, bankAccountId: A.bankId, qrCodeId: A.qrId }]);
      expect(qr.status).toBe(201);
      expect(await prisma.salePayment.findFirst({ where: { saleId: qr.body.data.id } })).toMatchObject({ method: 'QR', bankAccountId: A.bankId, qrCodeId: A.qrId, cardLast4: null });
    });

    it('7. valid split payments are saved line by line; zero-amount lines are not saved', async () => {
      const r = await sale(A, [
        { method: 'CASH', amount: 50 },
        { method: 'CARD', amount: 100, cardLast4: '1111' },
        { method: 'QR', amount: 50, bankAccountId: A.bankId, qrCodeId: A.qrId },
        { method: 'BANK_TRANSFER', amount: 0, bankAccountId: A.bankId },
        { method: 'CASH', amount: 0, cardLast4: '9999' },
      ]);
      expect(r.status).toBe(201);
      const pays = await prisma.salePayment.findMany({ where: { saleId: r.body.data.id }, orderBy: { amount: 'asc' } });
      expect(pays.map((p) => [p.method, p.amount, p.cardLast4])).toEqual(expect.arrayContaining([['CASH', 50, null], ['QR', 50, null], ['CARD', 100, '1111']]));
      expect(pays).toHaveLength(3);
    });

    it('idempotency: a retry with the same key returns the same sale (zero lines included in the request)', async () => {
      const key = `retry-${run}`;
      const body = [{ method: 'CARD', amount: A.price, cardLast4: '7777' }, { method: 'CASH', amount: 0 }];
      const first = await sale(A, body, { clientRequestId: key });
      const again = await sale(A, body, { clientRequestId: key });
      expect(first.status).toBe(201);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(await prisma.sale.count({ where: { tenantId: A.id, clientRequestId: key } })).toBe(1);
    });
  });

  // ── H2 ───────────────────────────────────────────────────────────────────
  describe('H2 manual cash out', () => {
    let reg = '';
    const move = (s: Shop, token: string, id: string, type: string, amount: number) =>
      post(s, token, `/cash/${id}/movements`, { type, amount, description: 'test' });
    const outs = (id: string) => prisma.cashMovement.findMany({ where: { registerId: id, type: { in: ['WITHDRAWAL', 'EXPENSE'] } } });

    beforeAll(async () => {
      // The cashier's sales above opened a wallet on Counter 1; give it a known float.
      const w = await prisma.cashRegister.findFirst({ where: { tenantId: A.id, cashierId: A.cashierId, status: 'OPEN' } });
      reg = w!.id;
      expect((await move(A, A.cashier, reg, 'DEPOSIT', 3000)).status).toBe(201);
    });

    const available = async () => {
      const r = await prisma.cashRegister.findUnique({ where: { id: reg }, include: { movements: true } });
      let x = r!.openingCash;
      for (const m of r!.movements) {
        if (['SALE', 'DEPOSIT', 'PAYMENT'].includes(m.type)) x += m.amount;
        if (['EXPENSE', 'REFUND', 'WITHDRAWAL'].includes(m.type)) x -= m.amount;
      }
      return Math.round(x * 100) / 100;
    };

    it('1. a withdrawal within the balance is recorded (no authoriser needed below the threshold)', async () => {
      const r = await move(A, A.cashier, reg, 'WITHDRAWAL', 1000);
      expect(r.status).toBe(201);
      const last = (await outs(reg)).pop();
      expect(last).toMatchObject({ type: 'WITHDRAWAL', amount: 1000, createdById: A.cashierId, authorizedById: null });
    });

    it('2. a withdrawal or expense above the drawer balance is refused', async () => {
      const bal = await available();
      expect((await move(A, A.cashier, reg, 'WITHDRAWAL', bal + 1)).status).toBe(400);
      expect((await move(A, A.cashier, reg, 'EXPENSE', bal + 0.01)).status).toBe(400);
      expect((await move(A, A.manager, reg, 'WITHDRAWAL', bal + 1)).status).toBe(400);
      expect(await available()).toBe(bal);
    });

    it('3. unauthorised: another cashier, or a cashier above the threshold, is refused', async () => {
      expect((await move(A, A.cashier2, reg, 'WITHDRAWAL', 10)).status).toBe(403);
      expect((await move(A, A.cashier, reg, 'DEPOSIT', 5000)).status).toBe(201); // balance now above the threshold
      expect((await move(A, A.cashier, reg, 'WITHDRAWAL', 5500)).status).toBe(403);
    });

    it('4. a manager may take out above the threshold and is recorded as the authoriser', async () => {
      const r = await move(A, A.manager, reg, 'WITHDRAWAL', 5500);
      expect(r.status).toBe(201);
      expect((await outs(reg)).pop()).toMatchObject({ amount: 5500, createdById: A.managerId, authorizedById: A.managerId });
    });

    it('5. two concurrent withdrawals of the whole balance: exactly one succeeds', async () => {
      const bal = await available();
      expect(bal).toBeGreaterThan(0);
      expect(bal).toBeLessThanOrEqual(5000);
      const before = (await outs(reg)).length;
      await pace();
      const body = { type: 'WITHDRAWAL', amount: bal, description: 'race' };
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post(`/api/v1/cash/${reg}/movements`).set(hdr(A, A.cashier)).send(body),
        request(app.getHttpServer()).post(`/api/v1/cash/${reg}/movements`).set(hdr(A, A.cashier)).send(body),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 400]);
      expect((await outs(reg)).length).toBe(before + 1);
      expect(await available()).toBe(0);
    });

    it('6. other shop and other branch cannot touch the drawer', async () => {
      expect((await move(B, B.admin, reg, 'DEPOSIT', 10)).status).toBe(404);
      expect((await move(B, B.manager, reg, 'WITHDRAWAL', 1)).status).toBe(404);
      expect((await move(A, A.manager2, reg, 'DEPOSIT', 10)).status).toBe(404); // manager of branch 2
      expect(await available()).toBe(0);
    });
  });
});
