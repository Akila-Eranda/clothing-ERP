/**
 * F-02 (refund pricing / cumulative over-return / refund approval) and F-04 (expense limits),
 * exercised over HTTP through the real guards, ValidationPipe and services against PostgreSQL.
 * Synthetic shops only (DATABASE_URL, schema applied). No Redis.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { RoleType } from '@prisma/client';

import appConfig from '../src/config/app.config';
import jwtConfig from '../src/config/jwt.config';
import databaseConfig from '../src/config/database.config';
import keycloakConfig from '../src/config/keycloak.config';
import mailConfig from '../src/config/mail.config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { ReturnsModule } from '../src/modules/returns/returns.module';
import { AccountingModule } from '../src/modules/accounting/accounting.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { BranchContextInterceptor } from '../src/common/interceptors/branch-context.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

jest.setTimeout(120_000);

type Shop = {
  tenantId: string; subdomain: string; branchId: string;
  anchor: string; rice: string; fractional: string; tv: string; soap: string;
  cashier: string; manager: string;
};

let __retSeq = 0;
const rid = () => `e2e-ret-${Date.now().toString(36)}-${(__retSeq++).toString(36)}`;

describe('Money controls: refunds (F-02) and expenses (F-04) over HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const run = Date.now().toString(36);
  let A: Shop;
  let B: Shop;
  let invoiceSeq = 0;

  const http = () => request(app.getHttpServer());
  const as = (shop: Shop, token: string) => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': shop.subdomain });

  async function perm(key: string) {
    const [resource, action] = key.split(':');
    return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
  }

  async function seedShop(label: string): Promise<Shop> {
    const subdomain = `mc${label}${run}`;
    const tenant = await prisma.tenant.create({
      data: { name: `MC ${label} ${run}`, subdomain, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    const tenantId = tenant.id;
    const branch = await prisma.branch.create({ data: { tenantId, name: 'Main', code: 'MAIN' } });

    // Same shape as the default roles: cashiers sell and record drawer expenses; managers also hold accounting.
    const cashierPerms = await Promise.all(['sales:create', 'sales:read', 'cash:create'].map(perm));
    const managerPerms = await Promise.all(['sales:create', 'sales:read', 'sales:update', 'cash:create', 'accounting:create', 'accounting:read', 'accounting:update'].map(perm));
    const role = (type: RoleType, perms: { id: string }[]) => prisma.role.create({
      data: { tenantId, name: `${type} ${label}`, type, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
    });
    const cashierRole = await role(RoleType.CASHIER, cashierPerms);
    const managerRole = await role(RoleType.BRANCH_MANAGER, managerPerms);
    const user = (who: string, roleId: string) => prisma.user.create({
      data: {
        tenantId, branchId: branch.id, email: `${who}-${label}-${run}@mc.test`, passwordHash: 'x',
        firstName: who, lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId } },
      },
    });
    const cashier = await user('cashier', cashierRole.id);
    const manager = await user('manager', managerRole.id);

    const variant = async (
      name: string,
      price: number,
      productSettings: { unit?: string | null; allowDecimalSelling?: boolean } = {},
    ) => {
      const p = await prisma.product.create({
        data: {
          tenantId, name: `${name} ${label}`, slug: `${name}-${label}-${run}`.toLowerCase(), sku: `${name}-${label}-${run}`.toUpperCase(),
          sellingPrice: price, costPrice: price * 0.8, mrp: price,
          ...productSettings,
          variants: { create: { sku: `${name}-${label}-${run}-V`.toUpperCase(), name: 'Default', sellingPrice: price, costPrice: price * 0.8, mrp: price } },
        },
        include: { variants: true },
      });
      return p.variants[0].id;
    };
    const sign = (u: { id: string; email: string }) => jwt.sign({ sub: u.id, email: u.email, tenantId, roles: [], permissions: [] });
    return {
      tenantId, subdomain, branchId: branch.id,
      anchor: await variant('Anchor', 1150),
      rice: await variant('Rice', 260, { unit: 'kg' }),
      fractional: await variant('Fractional', 100, { allowDecimalSelling: true }),
      tv: await variant('TV', 1000),
      soap: await variant('Soap', 120),
      cashier: sign(cashier), manager: sign(manager),
    };
  }

  /** A completed card sale. lines: [variantId, qty, unitPrice]; total = Σ lines − billDiscount. */
  async function sale(shop: Shop, lines: [string, number, number][], billDiscount = 0) {
    const subtotal = lines.reduce((s, [, q, p]) => s + q * p, 0);
    return prisma.sale.create({
      data: {
        tenantId: shop.tenantId, branchId: shop.branchId, invoiceNumber: `MC-${run}-${++invoiceSeq}`,
        subtotal, discountAmount: billDiscount, total: subtotal - billDiscount, status: 'COMPLETED', paymentMethod: 'CARD',
        items: {
          create: lines.map(([variantId, quantity, unitPrice]) => ({
            variantId, productName: 'item', variantName: 'Default', sku: variantId, quantity, unitPrice, total: quantity * unitPrice,
          })),
        },
      },
    });
  }

  const returnBody = (saleId: string, items: { variantId: string; quantity: number; unitPrice?: number }[], extra: Record<string, unknown> = {}) =>
    ({ clientRequestId: rid(), originalSaleId: saleId, reason: 'DEFECTIVE', restockItems: false, items, ...extra });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig, jwtConfig, databaseConfig, keycloakConfig, mailConfig], ignoreEnvFile: true }),
        EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
        ScheduleModule.forRoot(),
        PrismaModule, AuthModule, ReturnsModule, AccountingModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: BranchContextInterceptor },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    A = await seedShop('a');
    B = await seedShop('b');
  });

  afterAll(async () => { await app?.close(); });

  // ── F-02 refunds ─────────────────────────────────────────
  describe('F-02 refunds', () => {
    it('refunds what was paid, ignoring a client-sent unitPrice (1 × Anchor = 1,150, not 99,999)', async () => {
      const s = await sale(A, [[A.anchor, 2, 1150]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.anchor, quantity: 1, unitPrice: 99_999 }]));
      expect(r.status).toBe(201);
      expect(r.body.data.refundAmount).toBe(1150);
      expect(r.body.data.items[0].unitPrice).toBe(1150);
      const stored = await prisma.return.findUniqueOrThrow({ where: { id: r.body.data.id } });
      expect(stored.refundAmount).toBe(1150);
    });

    it('blocks a cumulative over-return across several requests (1 + 1 ok, then a 3rd → 400)', async () => {
      const s = await sale(A, [[A.anchor, 2, 1150]]);
      const one = () => http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.anchor, quantity: 1 }]));
      expect((await one()).status).toBe(201);
      expect((await one()).status).toBe(201);
      const third = await one();
      expect(third.status).toBe(400);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(2);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('REFUNDED');
      expect(third.body.message).toMatch(/fully refunded|already returned/);
    });

    it('two simultaneous full returns of the same sale: exactly one succeeds', async () => {
      const s = await sale(A, [[A.soap, 2, 120]]);
      // Two DIFFERENT requests (distinct clientRequestId) for the same goods: exactly one may succeed.
      const [x, y] = await Promise.all([
        http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 2 }])),
        http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 2 }])),
      ]);
      expect([x.status, y.status].sort()).toEqual([201, 400]);
      const rows = await prisma.return.findMany({ where: { originalSaleId: s.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].refundAmount).toBe(240);
    });

    it('idempotency: the SAME clientRequestId (retry / parallel double submit) returns one return and refunds once', async () => {
      const s = await sale(A, [[A.soap, 2, 120]]);
      const body = returnBody(s.id, [{ variantId: A.soap, quantity: 1 }]);
      const [x, y] = await Promise.all([
        http().post('/api/v1/returns').set(as(A, A.cashier)).send(body),
        http().post('/api/v1/returns').set(as(A, A.cashier)).send(body),
      ]);
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.body.data.id).toBe(y.body.data.id);
      const retry = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(body);
      expect(retry.status).toBe(201);
      expect(retry.body.data.id).toBe(x.body.data.id);
      const rows = await prisma.return.findMany({ where: { originalSaleId: s.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].refundAmount).toBe(120);
    });

    it('idempotency: reusing a clientRequestId for a DIFFERENT return is refused and creates nothing', async () => {
      const s = await sale(A, [[A.soap, 3, 120]]);
      const key = rid();
      const first = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 1 }], { clientRequestId: key }));
      expect(first.status).toBe(201);
      const other = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 2 }], { clientRequestId: key }));
      expect(other.status).toBe(400);
      expect(String(other.body.message)).toMatch(/already used for a different return/);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(1);
    });

    it('a return without clientRequestId is refused (400) and creates nothing', async () => {
      const s = await sale(A, [[A.soap, 1, 120]]);
      const { clientRequestId: _omit, ...noKey } = returnBody(s.id, [{ variantId: A.soap, quantity: 1 }]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(noKey);
      expect(r.status).toBe(400);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(0);
    });

    it('spreads a bill discount: 2 × Anchor from a 10%-discounted bill refunds 2,070', async () => {
      const s = await sale(A, [[A.anchor, 2, 1150], [A.rice, 0.5, 260]], 243); // 2,430 − 243 = 2,187
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.anchor, quantity: 2 }]));
      expect(r.status).toBe(201);
      expect(r.body.data.refundAmount).toBe(2070);
    });

    it('decimal quantity: 0.25 kg of loose rice refunds 65', async () => {
      const s = await sale(A, [[A.rice, 0.5, 260]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.rice, quantity: 0.25 }]));
      expect(r.status).toBe(201);
      expect(r.body.data.refundAmount).toBe(65);
      expect(r.body.data.items[0].quantity).toBe(0.25);
    });

    it('rejects a fractional piece return but accepts a whole-number return', async () => {
      const s = await sale(A, [[A.anchor, 2, 1150]]);
      const fractional = await http().post('/api/v1/returns').set(as(A, A.cashier))
        .send(returnBody(s.id, [{ variantId: A.anchor, quantity: 0.5 }]));
      expect(fractional.status).toBe(400);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(0);

      const whole = await http().post('/api/v1/returns').set(as(A, A.cashier))
        .send(returnBody(s.id, [{ variantId: A.anchor, quantity: 1 }]));
      expect(whole.status).toBe(201);
      expect(whole.body.data.items[0].quantity).toBe(1);
    });

    it('accepts fractional returns for weight-based and fraction-enabled products', async () => {
      for (const variantId of [A.rice, A.fractional]) {
        const s = await sale(A, [[variantId, 0.5, 100]]);
        const r = await http().post('/api/v1/returns').set(as(A, A.cashier))
          .send(returnBody(s.id, [{ variantId, quantity: 0.25 }]));
        expect(r.status).toBe(201);
        expect(r.body.data.items[0].quantity).toBe(0.25);
      }
    });

    it('allows a legacy fractional sale return after the product becomes piece-based, within the original quantity', async () => {
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: A.fractional },
        select: { productId: true },
      });
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: variant.productId },
        select: { unit: true, allowDecimalSelling: true },
      });
      const s = await sale(A, [[A.fractional, 0.5, 100]]);
      try {
        await prisma.product.update({
          where: { id: variant.productId },
          data: { unit: 'pcs', allowDecimalSelling: false },
        });
        const first = await http().post('/api/v1/returns').set(as(A, A.cashier))
          .send(returnBody(s.id, [{ variantId: A.fractional, quantity: 0.3 }]));
        expect(first.status).toBe(201);

        const over = await http().post('/api/v1/returns').set(as(A, A.cashier))
          .send(returnBody(s.id, [{ variantId: A.fractional, quantity: 0.3 }]));
        expect(over.status).toBe(400);

        const remaining = await http().post('/api/v1/returns').set(as(A, A.cashier))
          .send(returnBody(s.id, [{ variantId: A.fractional, quantity: 0.2 }]));
        expect(remaining.status).toBe(201);
      } finally {
        await prisma.product.update({ where: { id: variant.productId }, data: product });
      }
    });

    it('applies the same fraction rule to outgoing exchange items', async () => {
      const pieceSale = await sale(A, [[A.anchor, 1, 1150]]);
      const rejected = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(
        pieceSale.id,
        [{ variantId: A.anchor, quantity: 1 }],
        { returnType: 'EXCHANGE', exchangeItems: [{ variantId: A.soap, quantity: 0.5 }] },
      ));
      expect(rejected.status).toBe(400);
      expect(await prisma.return.count({ where: { originalSaleId: pieceSale.id } })).toBe(0);

      for (const variantId of [A.rice, A.fractional]) {
        const s = await sale(A, [[A.anchor, 1, 1150]]);
        const accepted = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(
          s.id,
          [{ variantId: A.anchor, quantity: 1 }],
          { returnType: 'EXCHANGE', exchangeItems: [{ variantId, quantity: 0.5 }] },
        ));
        expect(accepted.status).toBe(201);
        expect((accepted.body.data.exchangeData as { quantity: number }[])[0].quantity).toBe(0.5);
      }
    });

    it('rejects an item that was not on the invoice', async () => {
      const s = await sale(A, [[A.anchor, 1, 1150]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 1 }]));
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/not on the original invoice/);
    });

    it('refund above LKR 5,000: cashier → 403 and nothing saved; manager → 201', async () => {
      const s = await sale(A, [[A.tv, 10, 1000]]);
      const body = returnBody(s.id, [{ variantId: A.tv, quantity: 6 }]); // 6,000
      const c = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(body);
      expect(c.status).toBe(403);
      expect(c.body.message).toMatch(/need a manager/);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(0);
      expect((await prisma.sale.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('COMPLETED');
      const m = await http().post('/api/v1/returns').set(as(A, A.manager)).send(body);
      expect(m.status).toBe(201);
      expect(m.body.data.refundAmount).toBe(6000);
    });

    it('a cashier may refund exactly LKR 5,000', async () => {
      const s = await sale(A, [[A.tv, 5, 1000]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: A.tv, quantity: 5 }]));
      expect(r.status).toBe(201);
      expect(r.body.data.refundAmount).toBe(5000);
    });

    it('exchange items are priced from the catalogue, not the client', async () => {
      const s = await sale(A, [[A.anchor, 1, 1150]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(
        s.id, [{ variantId: A.anchor, quantity: 1 }],
        { returnType: 'EXCHANGE', exchangeItems: [{ variantId: A.soap, quantity: 2, unitPrice: 0 }] },
      ));
      expect(r.status).toBe(201);
      expect(r.body.data.exchangeAmount).toBe(240);
      expect(r.body.data.refundAmount).toBe(910);
    });

    it('an approved (refunded) return cannot be rejected afterwards, so the items cannot be refunded twice', async () => {
      const s = await sale(A, [[A.anchor, 1, 1150]]);
      const first = await http().post('/api/v1/returns').set(as(A, A.manager)).send(returnBody(s.id, [{ variantId: A.anchor, quantity: 1 }]));
      expect(first.status).toBe(201);
      expect(first.body.data.status).toBe('APPROVED');
      const reject = await http().put(`/api/v1/returns/${first.body.data.id}/status`).set(as(A, A.manager)).send({ status: 'REJECTED' });
      expect(reject.status).toBe(400);
      expect((await prisma.return.findUniqueOrThrow({ where: { id: first.body.data.id } })).status).toBe('APPROVED');
      const again = await http().post('/api/v1/returns').set(as(A, A.manager)).send(returnBody(s.id, [{ variantId: A.anchor, quantity: 1 }]));
      expect(again.status).toBe(400);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(1);
    });

    it('the normal follow-up still works: approved refund → REFUND_PROCESSED', async () => {
      const s = await sale(A, [[A.soap, 1, 120]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.manager)).send(returnBody(s.id, [{ variantId: A.soap, quantity: 1 }]));
      const done = await http().put(`/api/v1/returns/${r.body.data.id}/status`).set(as(A, A.manager)).send({ status: 'REFUND_PROCESSED' });
      expect(done.status).toBe(200);
      expect((await prisma.return.findUniqueOrThrow({ where: { id: r.body.data.id } })).status).toBe('REFUND_PROCESSED');
    });

    it("another shop's sale cannot be returned (404) and its sale is untouched", async () => {
      const s = await sale(B, [[B.anchor, 1, 1150]]);
      const r = await http().post('/api/v1/returns').set(as(A, A.cashier)).send(returnBody(s.id, [{ variantId: B.anchor, quantity: 1 }]));
      expect(r.status).toBe(404);
      expect(await prisma.return.count({ where: { originalSaleId: s.id } })).toBe(0);
    });
  });

  // ── F-04 expenses ───────────────────────────────────────
  describe('F-04 expenses', () => {
    const expense = (shop: Shop, token: string, amount: number, description = `exp ${amount}`) =>
      http().post('/api/v1/accounting/expenses').set(as(shop, token))
        .send({ amount, description: `${description} ${run}`, date: new Date().toISOString(), paymentMethod: 'CARD' });
    const saved = (shop: Shop, amount: number) =>
      prisma.expense.count({ where: { tenantId: shop.tenantId, amount, description: { contains: run } } });

    it('cashier: LKR 1,500 and exactly 5,000 are recorded', async () => {
      expect((await expense(A, A.cashier, 1500)).status).toBe(201);
      expect((await expense(A, A.cashier, 5000)).status).toBe(201);
    });

    it('cashier: 5,000.01 → 403 and nothing saved', async () => {
      const r = await expense(A, A.cashier, 5000.01);
      expect(r.status).toBe(403);
      expect(r.body.message).toMatch(/need a manager/);
      expect(await saved(A, 5000.01)).toBe(0);
    });

    it('zero, negative and absurd amounts → 400 for everyone, nothing saved', async () => {
      for (const token of [A.cashier, A.manager]) {
        for (const amount of [0, -50, 100_000_001]) {
          expect((await expense(A, token, amount)).status).toBe(400);
          expect(await saved(A, amount)).toBe(0);
        }
      }
    });

    it('manager is not capped (LKR 250,000)', async () => {
      const r = await expense(A, A.manager, 250_000);
      expect(r.status).toBe(201);
      expect(await saved(A, 250_000)).toBe(1);
    });

    it('per-shop cashier limit (2,000) applies to that shop only', async () => {
      await prisma.tenant.update({ where: { id: B.tenantId }, data: { settings: { pos: { cashierExpenseLimit: 2000 } } } });
      const b = await expense(B, B.cashier, 2500);
      expect(b.status).toBe(403);
      expect(b.body.message).toMatch(/LKR 2,000/);
      expect((await expense(A, A.cashier, 2500)).status).toBe(201);
    });

    it('a cashier cannot raise an existing expense afterwards (no accounting:update)', async () => {
      const created = await expense(A, A.cashier, 1000, 'edit-me');
      expect(created.status).toBe(201);
      const r = await http().put(`/api/v1/accounting/expenses/${created.body.data.id}`).set(as(A, A.cashier)).send({ amount: 90_000 });
      expect(r.status).toBe(403);
      expect((await prisma.expense.findUniqueOrThrow({ where: { id: created.body.data.id } })).amount).toBe(1000);
    });
  });
});
