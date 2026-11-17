/**
 * POS security wave 1B — HTTP + DB + real WebSocket on the full AppModule (isolated Wave-1 runner only).
 *
 * Traceability (original audit numbering, see docs/production-readiness-2026-11.md §1a-5):
 *   P-F5  non-cash payment above the bill must not become cash change
 *   P-F6  a return needs the original sale (no stock added by a bare "return")
 *   P-F7  custom bill-only lines need manager authority; catalogue variants cannot be sent as custom lines
 *   gift-voucher redemption is row-locked (no overspend under concurrency, no cross-shop use)
 *   bank account / QR code named by a payment must belong to the shop
 *   WebSocket branch rooms (join-branch) honour tenant + assigned branch; Tenant Admin may switch inside the tenant
 *
 * Nothing here relaxes an existing rule; every refusal is asserted together with "nothing was written".
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { ProductKind } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { PERMISSION_CATALOGUE } from '../src/shared/security/permission-catalogue';
import { ensureSystemRoles } from '../src/modules/roles/default-system-roles';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocketClient = require('ws');

jest.setTimeout(300_000);

type Shop = {
  id: string; sub: string; branchId: string; branch2Id: string; counterId: string;
  variantId: string; productName: string; bankId: string; qrId: string;
  cashier: string; cashier3: string; manager: string; admin: string;
};

describe('POS security wave 1B (HTTP + DB + WebSocket)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port = 0;
  const run = Date.now().toString(36);
  const PASSWORD = `PSW1B-${Date.now()}-pw!`;
  let A: Shop;
  let B: Shop;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop, token: string) =>
    ({ Authorization: `Bearer ${token}`, 'x-tenant-id': s.sub, Host: 'localhost', 'x-pos-counter-id': s.counterId });
  const call = async (method: 'get' | 'post', s: Shop, token: string, url: string, body?: unknown) => {
    await pace();
    const r = request(app.getHttpServer())[method](`/api/v1${url}`).set(hdr(s, token));
    return body === undefined ? r : r.send(body as object);
  };
  const line = (s: Shop, quantity: number, unitPrice: number, extra: object = {}) =>
    ({ variantId: s.variantId, productName: s.productName, variantName: 'Default', sku: 'SKU', quantity, unitPrice, costPrice: 1, ...extra });
  const sale = (s: Shop, token: string, items: object[], payments: object[], extra: object = {}) =>
    call('post', s, token, '/pos/sale', { items, payments, applyTierDiscount: false, ...extra });
  const saleCount = (s: Shop) => prisma.sale.count({ where: { tenantId: s.id } });
  const onHand = async (s: Shop) =>
    (await prisma.inventory.aggregate({ where: { tenantId: s.id, variantId: s.variantId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  let rseq = 0;
  const rid = () => `psw1b-${run}-${(rseq++).toString(36)}`;

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `pswb${label}${run}`;
    const t = await prisma.tenant.create({
      data: { name: `PSWB ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE', settings: { pos: { allowNegativeStock: false } } },
    });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const branch2 = await prisma.branch.create({ data: { tenantId: t.id, name: 'Second', code: 'SEC' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WHB-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    await ensureSystemRoles(prisma, t.id);
    const roleId = async (name: string) => (await prisma.role.findFirstOrThrow({ where: { tenantId: t.id, name } })).id;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = (who: string, rid2: string, branchId = branch.id) => prisma.user.create({
      data: { tenantId: t.id, branchId, email: `${who}-${run}@pswb${label}.test`, passwordHash: hash, firstName: who, lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: rid2 } } },
    });
    const users = {
      cashier: await mk('cashier', await roleId('Cashier')),
      cashier3: await mk('cashier3', await roleId('Cashier'), branch2.id),
      manager: await mk('manager', await roleId('Branch Manager')),
      admin: await mk('admin', await roleId('Tenant Admin')),
    };
    const login = async (email: string) => {
      const r = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
      await pace();
      return r.body.data.accessToken as string;
    };
    const p = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Milk ${label}`, slug: `milkb-${label}-${run}`, sku: `MILKB-${label}-${run}-P`, status: 'ACTIVE',
        sellingPrice: 200, costPrice: 150, mrp: 220, unit: 'pcs', productKind: ProductKind.STANDARD, allowDecimalSelling: false,
        variants: { create: { sku: `MILKB-${label}-${run}`, name: 'Default', sellingPrice: 200, costPrice: 150, mrp: 220 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: p.variants[0].id, quantity: 500, damagedQty: 0, returnedQty: 0 } });
    const bank = await prisma.bankAccount.create({ data: { tenantId: t.id, code: `BNK-${label}`, name: `Bank ${label}` } });
    const qr = await prisma.paymentQrCode.create({ data: { tenantId: t.id, bankAccountId: bank.id, label: `QR ${label}`, mode: 'STATIC', isActive: true } });
    return {
      id: t.id, sub, branchId: branch.id, branch2Id: branch2.id, counterId: counter.id,
      variantId: p.variants[0].id, productName: p.name, bankId: bank.id, qrId: qr.id,
      cashier: await login(users.cashier.email), cashier3: await login(users.cashier3.email),
      manager: await login(users.manager.email), admin: await login(users.admin.email),
    };
  }

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    await app.listen(0, '127.0.0.1'); // real socket for the WebSocket tests (loopback only)
    port = (app.getHttpServer().address() as { port: number }).port;
    prisma = m.get(PrismaService);
    A = await seed('a');
    B = await seed('b');
    // an open drawer for A's cashier so cash sales can complete
    expect((await call('post', A, A.cashier, '/cash/open', { openingCash: 5000, counterId: A.counterId })).status).toBe(201);
    expect((await call('post', B, B.cashier, '/cash/open', { openingCash: 5000, counterId: B.counterId })).status).toBe(201);
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 1500)); // let the accounting outbox finish before the DB closes
    await app?.close();
  });

  // ── P-F5 ────────────────────────────────────────────────────────────────
  describe('P-F5 non-cash payment above the bill', () => {
    it('CARD / BANK_TRANSFER far above the bill is refused (no cash change from a card); nothing is written', async () => {
      const count = await saleCount(A);
      const stock = await onHand(A);
      const card = await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'CARD', amount: 100_000, cardLast4: '4242' }]);
      expect(card.status).toBe(400);
      expect(String(card.body.message)).toMatch(/Overpayment must include enough cash/);
      const bank = await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'BANK_TRANSFER', amount: 100_000, bankAccountId: A.bankId }]);
      expect(bank.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
      expect(await onHand(A)).toBe(stock);
    });
    it('CONTROLS: an exact CARD payment and a CASH overpayment (change) still complete', async () => {
      expect((await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'CARD', amount: 200, cardLast4: '4242' }])).status).toBe(201);
      expect((await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'CASH', amount: 1000 }])).status).toBe(201);
    });
  });

  // ── P-F6 ────────────────────────────────────────────────────────────────
  describe('P-F6 a return needs the original sale', () => {
    it('POST /returns and POST /pos/returns without originalSaleId are refused; no stock added, no return created', async () => {
      const stock = await onHand(A);
      const before = await prisma.return.count({ where: { tenantId: A.id } });
      const body = { clientRequestId: rid(), reason: 'DEFECTIVE', items: [{ variantId: A.variantId, quantity: 5 }] };
      const r1 = await call('post', A, A.cashier, '/returns', body);
      expect(r1.status).toBe(400);
      const r2 = await call('post', A, A.cashier, '/pos/returns', { ...body, clientRequestId: rid(), items: [{ ...body.items[0], unitPrice: 200, productName: 'x', variantName: 'y', sku: 's' }], refundMethod: 'CASH' });
      expect(r2.status).toBeGreaterThanOrEqual(400);
      expect(r2.status).toBeLessThan(500);
      expect(await onHand(A)).toBe(stock);
      expect(await prisma.return.count({ where: { tenantId: A.id } })).toBe(before);
    });
    it("another shop's sale cannot be used as the original sale", async () => {
      const own = await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(own.status).toBe(201);
      const stock = await onHand(A);
      const r = await call('post', A, A.cashier, '/returns', { clientRequestId: rid(), originalSaleId: own.body.data.id, reason: 'DEFECTIVE', items: [{ variantId: A.variantId, quantity: 1 }] });
      expect(r.status).toBe(404);
      expect(await onHand(A)).toBe(stock);
      expect(await prisma.return.count({ where: { tenantId: A.id, originalSaleId: own.body.data.id } })).toBe(0);
    });
  });

  // ── P-F7 ────────────────────────────────────────────────────────────────
  describe('P-F7 custom bill-only lines', () => {
    const custom = { isCustom: true, productName: 'Carry bag', variantName: '', sku: 'CUSTOM', quantity: 1, unitPrice: 50, costPrice: 1 };
    it('a Cashier cannot sell a custom line (403) and nothing is written', async () => {
      const count = await saleCount(A);
      const r = await sale(A, A.cashier, [custom], [{ method: 'CASH', amount: 50 }]);
      expect(r.status).toBe(403);
      expect(String(r.body.message)).toMatch(/manager authorization/);
      expect(await saleCount(A)).toBe(count);
    });
    it('a catalogue variant cannot be disguised as a custom line, even by a Tenant Admin or Branch Manager (400)', async () => {
      const count = await saleCount(A);
      const r = await sale(A, A.admin, [{ ...custom, variantId: A.variantId, unitPrice: 1 }], [{ method: 'CASH', amount: 1 }]);
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
    });
    it('CONTROL: a Tenant Admin may sell a genuine custom line', async () => {
      const r = await sale(A, A.admin, [custom], [{ method: 'CASH', amount: 50 }]);
      expect(r.status).toBe(201);
    });
    it('a Branch Manager can ring sales (sales:create, Step 1B) and sell a genuine custom line', async () => {
      const r = await sale(A, A.manager, [custom], [{ method: 'CASH', amount: 50 }]);
      expect(r.status).toBe(201);
      const plain = await sale(A, A.manager, [line(A, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(plain.status).toBe(201);
    });
    it('a Branch Manager still gets NO direct manual discount (policy not configured): 403, nothing written', async () => {
      const count = await saleCount(A);
      const r = await sale(A, A.manager, [line(A, 1, 200, { discount: 10, discountType: 'FIXED' })], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBe(403);
      expect(String(r.body.message)).toMatch(/Manual discounts require an approved manager workflow/);
      const bill = await sale(A, A.manager, [line(A, 1, 200)], [{ method: 'CASH', amount: 200 }], { discountAmount: 10 });
      expect(bill.status).toBe(403);
      expect(await saleCount(A)).toBe(count);
    });
  });

  // ── gift voucher locking ────────────────────────────────────────────────
  describe('gift voucher redemption', () => {
    it('two concurrent redemptions of 200 against a balance of 300: exactly one wins, balance never negative', async () => {
      const code = `GVB-${run}-1`.toUpperCase();
      await prisma.giftVoucher.create({ data: { tenantId: A.id, code, initialAmount: 300, balance: 300 } });
      const send = (token: string) => request(app.getHttpServer()).post('/api/v1/pos/sale').set(hdr(A, token))
        .send({ items: [line(A, 1, 200)], payments: [{ method: 'GIFT_VOUCHER', amount: 200, reference: code }], applyTierDiscount: false });
      await pace();
      const [x, y] = await Promise.all([send(A.cashier), send(A.admin)]);
      expect([x.status, y.status].sort()).toEqual([201, 400]);
      expect((await prisma.giftVoucher.findFirstOrThrow({ where: { tenantId: A.id, code } })).balance).toBe(100);
      expect(await prisma.salePayment.count({ where: { sale: { tenantId: A.id }, method: 'GIFT_VOUCHER', reference: code } })).toBe(1);
    });
    it("another shop's cashier cannot use this shop's voucher; the balance is untouched", async () => {
      const code = `GVB-${run}-2`.toUpperCase();
      await prisma.giftVoucher.create({ data: { tenantId: A.id, code, initialAmount: 500, balance: 500 } });
      const count = await saleCount(B);
      const r = await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'GIFT_VOUCHER', amount: 200, reference: code }]);
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toMatch(/Gift voucher not found/);
      expect(await saleCount(B)).toBe(count);
      expect((await prisma.giftVoucher.findFirstOrThrow({ where: { tenantId: A.id, code } })).balance).toBe(500);
    });
    it('a voucher cannot pay more than its balance', async () => {
      const code = `GVB-${run}-3`.toUpperCase();
      await prisma.giftVoucher.create({ data: { tenantId: A.id, code, initialAmount: 100, balance: 100 } });
      const count = await saleCount(A);
      const r = await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'GIFT_VOUCHER', amount: 200, reference: code }]);
      expect(r.status).toBe(400);
      expect(await saleCount(A)).toBe(count);
      expect((await prisma.giftVoucher.findFirstOrThrow({ where: { tenantId: A.id, code } })).balance).toBe(100);
    });
  });

  // ── bank / QR ownership ─────────────────────────────────────────────────
  describe('bank account and QR code ownership', () => {
    it("a payment naming another shop's bank account or QR code is refused; nothing is written", async () => {
      const count = await saleCount(B);
      const stock = await onHand(B);
      const bank = await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'BANK_TRANSFER', amount: 200, bankAccountId: A.bankId }]);
      expect(bank.status).toBe(400);
      const qrOtherBank = await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'QR', amount: 200, bankAccountId: A.bankId, qrCodeId: A.qrId }]);
      expect(qrOtherBank.status).toBe(400);
      const qrForeignCode = await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'QR', amount: 200, bankAccountId: B.bankId, qrCodeId: A.qrId }]);
      expect(qrForeignCode.status).toBe(400);
      expect(await saleCount(B)).toBe(count);
      expect(await onHand(B)).toBe(stock);
    });
    it('CONTROL: the shop\'s own bank account and QR code are accepted', async () => {
      expect((await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'BANK_TRANSFER', amount: 200, bankAccountId: B.bankId }])).status).toBe(201);
      expect((await sale(B, B.cashier, [line(B, 1, 200)], [{ method: 'QR', amount: 200, bankAccountId: B.bankId, qrCodeId: B.qrId }])).status).toBe(201);
    });
  });

  // ── WebSocket branch rooms ──────────────────────────────────────────────
  describe('WebSocket branch-room authorisation', () => {
    type Client = { events: { name: string; data: any }[]; ready: Promise<boolean>; join: (branchId: string) => void; close: () => void; disconnected: () => boolean };
    const sockets: Client[] = [];
    /** Minimal Socket.IO v4 client (Engine.IO 4 over `ws`) — no new dependency. */
    function connect(token: string | null): Client {
      const events: { name: string; data: any }[] = [];
      let gone = false;
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
      let resolveReady: (ok: boolean) => void = () => undefined;
      const ready = new Promise<boolean>((res) => { resolveReady = res; });
      setTimeout(() => resolveReady(false), 6000);
      ws.on('message', (raw: Buffer) => {
        const msg = raw.toString();
        if (msg === '2') { ws.send('3'); return; }                                         // ping -> pong
        if (msg.startsWith('0')) { ws.send(`40/ws,${JSON.stringify(token ? { token } : {})}`); return; } // open -> connect namespace
        if (msg.startsWith('40/ws')) { resolveReady(true); return; }                       // namespace connected
        if (msg.startsWith('44/ws') || msg.startsWith('41/ws')) { gone = true; resolveReady(false); return; }
        if (msg.startsWith('42/ws,')) {
          const [name, data] = JSON.parse(msg.slice('42/ws,'.length));
          events.push({ name, data });
        }
      });
      ws.on('close', () => { gone = true; resolveReady(false); });
      ws.on('error', () => resolveReady(false));
      const client: Client = {
        events,
        ready,
        join: (branchId) => ws.send(`42/ws,${JSON.stringify(['join-branch', branchId])}`),
        close: () => ws.close(),
        disconnected: () => gone,
      };
      sockets.push(client);
      return client;
    }
    const settle = () => new Promise((r) => setTimeout(r, 900)); // the gateway looks the user up / joins rooms asynchronously
    const emitSale = (tenantId: string, branchId: string, saleId: string) =>
      app.get(EventEmitter2).emit('pos.sale.completed', { saleId, tenantId, branchId, total: 1 });
    const names = (c: Client, name: string) => c.events.filter((e) => e.name === name).map((e) => e.data?.saleId);
    afterAll(() => { for (const s of sockets) s.close(); });

    it('a connection without a token, or with a forged token, is dropped by the server and receives nothing', async () => {
      const none = connect(null);
      const forged = connect('not-a-jwt');
      await none.ready; await forged.ready;          // the namespace ack may arrive first; the gateway then disconnects the socket
      await settle();
      emitSale(A.id, A.branchId, `ws-${run}-anon`);
      await settle();
      expect(none.disconnected()).toBe(true);
      expect(forged.disconnected()).toBe(true);
      expect(none.events).toHaveLength(0);
      expect(forged.events).toHaveLength(0);
    });

    it('an assigned-branch Cashier receives only their own branch room; cannot join another branch or another shop', async () => {
      const c1 = connect(A.cashier);       // branch 1 of shop A
      const c3 = connect(A.cashier3);      // branch 2 of shop A
      const cb = connect(B.cashier);       // shop B
      expect(await Promise.all([c1.ready, c3.ready, cb.ready])).toEqual([true, true, true]);
      await settle();
      c1.join(A.branch2Id);                // other branch, same shop -> refused
      c1.join(B.branchId);                 // other shop -> refused
      cb.join(A.branchId);                 // other shop's branch -> refused
      cb.join(A.branch2Id);
      await settle();

      emitSale(A.id, A.branch2Id, `ws-${run}-b2`);
      emitSale(A.id, A.branchId, `ws-${run}-b1`);
      emitSale(B.id, B.branchId, `ws-${run}-bb`);
      await settle();

      expect(names(c1, 'sale:completed')).toEqual([`ws-${run}-b1`]);   // own branch only
      expect(names(c3, 'sale:completed')).toEqual([`ws-${run}-b2`]);
      expect(names(cb, 'sale:completed')).toEqual([`ws-${run}-bb`]);   // never shop A's sales
      for (const c of [c1, c3, cb]) expect(c.events.filter((e) => e.name === 'stats:update')).toHaveLength(0); // tenant room is for tenant-wide roles only
    });

    it('a real completed sale reaches the cashier\'s own branch room (integration through the event bus)', async () => {
      const c1 = connect(A.cashier);
      expect(await c1.ready).toBe(true);
      await settle();
      const r = await sale(A, A.cashier, [line(A, 1, 200)], [{ method: 'CASH', amount: 200 }]);
      expect(r.status).toBe(201);
      await settle();
      expect(names(c1, 'sale:completed')).toContain(r.body.data.id);
    });

    it('a Tenant Admin gets tenant-wide updates and may join any branch of their OWN shop, never another shop\'s', async () => {
      const admin = connect(A.admin);
      expect(await admin.ready).toBe(true);
      await settle();
      admin.join(A.branch2Id);             // allowed: same tenant
      admin.join(B.branchId);              // refused: other tenant (branch lookup is tenant-scoped)
      await settle();
      emitSale(A.id, A.branch2Id, `ws-${run}-adm2`);
      emitSale(B.id, B.branchId, `ws-${run}-admB`);
      await settle();
      expect(names(admin, 'sale:completed')).toContain(`ws-${run}-adm2`);
      expect(names(admin, 'sale:completed')).not.toContain(`ws-${run}-admB`);
      expect(admin.events.filter((e) => e.name === 'stats:update').map((e) => e.data?.data?.saleId)).toContain(`ws-${run}-adm2`);
      expect(admin.events.filter((e) => e.name === 'stats:update').map((e) => e.data?.data?.saleId)).not.toContain(`ws-${run}-admB`);
    });
  });
});
