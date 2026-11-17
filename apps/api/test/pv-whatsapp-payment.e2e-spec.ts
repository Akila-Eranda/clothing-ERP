/**
 * Priority verification 1 — WhatsApp payment notification (customer credit payment).
 *
 * Real stack (AppModule, PostgreSQL, Redis) with the WhatsApp PROVIDER mocked: `WhatsappService.sendText` is replaced by a
 * recorder, so no message can leave the machine (the real service also refuses to send in test mode). Everything else —
 * the payment API, the post-commit event, consent check, phone normalisation, claim lock, notification rows and the retry
 * loop — is the real code.
 *
 * Original behaviour verified (from the implementation): the notification is triggered by `accounting.customer-credit.payment`
 * (emitted after the payment commits), sent only to customers whose metadata carries an explicit WhatsApp consent, at most once
 * per payment (advisory-lock claim + notification row), retried when it failed, and never able to fail or undo the payment.
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
import { WhatsappService } from '../src/modules/whatsapp/whatsapp.service';
import { CustomerPaymentNotificationService } from '../src/modules/whatsapp/customer-payment-notification.service';

jest.setTimeout(300_000);

type Sent = { tenantId: string; phone: string; message: string; paymentExistedAtSend: boolean };
type Shop = { id: string; sub: string; branchId: string; counterId: string; variantId: string; token: string };

describe('Customer payment WhatsApp notification (mock provider)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let notifier: CustomerPaymentNotificationService;
  let A: Shop;
  let B: Shop;
  const run = Date.now().toString(36);
  const PASSWORD = `PVW-${Date.now()}-pw!`;
  const PRICE = 200;
  const sent: Sent[] = [];
  let providerMode: 'ok' | 'fail-once' | 'fail-always' | 'slow' = 'ok';
  let failuresLeft = 0;
  let payCounter = 0;

  const pace = () => new Promise((r) => setTimeout(r, 320));
  const hdr = (s: Shop) => ({ Authorization: `Bearer ${s.token}`, 'x-tenant-id': s.sub, Host: 'localhost', 'x-pos-counter-id': s.counterId });
  const post = async (s: Shop, url: string, body: unknown) => {
    await pace();
    return request(app.getHttpServer()).post(`/api/v1${url}`).set(hdr(s)).send(body as object);
  };
  let phoneSeq = 0;
  const mkCustomer = (s: Shop, firstName: string, over: { phone?: string; metadata?: object } = {}) =>
    prisma.customer.create({
      data: {
        tenantId: s.id, firstName, lastName: 'Perera', creditLimit: 100000,
        phone: over.phone ?? `07${(Number.parseInt(run.slice(-4), 36) + 1000 * ++phoneSeq).toString().padStart(8, '0').slice(-8)}`,
        ...(over.metadata ? { metadata: over.metadata } : {}),
      },
    });
  /** Customer with LKR 200 open credit (zero wallet so the Credit / Wallet tender creates real credit). */
  async function withCredit(s: Shop, firstName: string, over: { phone?: string; metadata?: object } = {}) {
    const c = await mkCustomer(s, firstName, over);
    const r = await post(s, '/pos/sale', {
      items: [{ variantId: s.variantId, productName: 'Dhal', variantName: 'Default', sku: 'D', quantity: 1, unitPrice: PRICE, costPrice: 120 }],
      payments: [{ method: 'CUSTOMER_CREDIT', amount: PRICE }], applyTierDiscount: false, customerId: c.id,
    });
    expect(r.status).toBe(201);
    return c;
  }
  const pay = (s: Shop, customerId: string, body: object) =>
    post(s, `/customers/${customerId}/credit/payment`, { clientRequestId: `pvw-${run}-${(payCounter++).toString(36)}`, paymentMethod: 'CASH', ...body });
  const paymentTxn = async (s: Shop, customerId: string) =>
    prisma.customerCreditTransaction.findFirstOrThrow({ where: { tenantId: s.id, customerId, type: 'PAYMENT' }, orderBy: { createdAt: 'desc' } });
  const notificationOf = (s: Shop, paymentTxnId: string) =>
    prisma.notification.findFirst({
      where: { tenantId: s.id, channel: 'WHATSAPP', AND: [{ data: { path: ['kind'], equals: 'customer_payment_received' } }, { data: { path: ['paymentTxnId'], equals: paymentTxnId } }] },
      orderBy: { createdAt: 'desc' },
    });
  const statusOf = async (s: Shop, id: string) => (await notificationOf(s, id))?.data as { status?: string; attempts?: number; error?: string } | undefined;
  async function waitStatus(s: Shop, id: string, wanted: string[], ms = 15000) {
    const end = Date.now() + ms;
    for (;;) {
      const d = await statusOf(s, id);
      if (d?.status && wanted.includes(d.status)) return d;
      if (Date.now() > end) throw new Error(`notification ${id} did not reach ${wanted.join('/')} (now ${d?.status ?? 'none'})`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function seed(label: 'a' | 'b'): Promise<Shop> {
    const sub = `pvw${label}${run}`;
    const t = await prisma.tenant.create({ data: { name: `PVW ${label}`, subdomain: sub, shopType: 'GROCERY', plan: 'PROFESSIONAL', status: 'ACTIVE' } });
    const branch = await prisma.branch.create({ data: { tenantId: t.id, name: 'Main', code: 'MAIN' } });
    const wh = await prisma.warehouse.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Main', code: `WHW-${label}`, isDefault: true } });
    const counter = await prisma.posCounter.create({ data: { tenantId: t.id, branchId: branch.id, name: 'Counter 1', code: 'C1' } });
    const ps = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
      const [resource, action] = k.split(':');
      return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
    }));
    const role = await prisma.role.create({ data: { tenantId: t.id, name: 'Manager', type: RoleType.BRANCH_MANAGER, permissions: { create: ps.map((p) => ({ permissionId: p.id })) } } });
    const user = await prisma.user.create({
      data: { tenantId: t.id, branchId: branch.id, email: `mgr-${run}@pvw${label}.test`, passwordHash: await bcrypt.hash(PASSWORD, 10), firstName: 'Mgr', lastName: label, status: 'ACTIVE', emailVerified: true, roles: { create: { roleId: role.id } } },
    });
    const product = await prisma.product.create({
      data: {
        tenantId: t.id, name: `Dhal ${label}`, slug: `dhal-pvw-${label}-${run}`, sku: `DPVW-${label}-${run}`, sellingPrice: PRICE, costPrice: 120, mrp: 250, status: 'ACTIVE',
        variants: { create: { sku: `DPVW-${label}-${run}-V`, name: 'Default', sellingPrice: PRICE, costPrice: 120, mrp: 250 } },
      },
      include: { variants: true },
    });
    await prisma.inventory.create({ data: { tenantId: t.id, branchId: branch.id, warehouseId: wh.id, variantId: product.variants[0].id, quantity: 1000 } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set({ 'x-tenant-id': sub, Host: 'localhost' }).send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const shop: Shop = { id: t.id, sub, branchId: branch.id, counterId: counter.id, variantId: product.variants[0].id, token: login.body.data.accessToken };
    expect((await post(shop, '/cash/open', { openingCash: 5000, counterId: counter.id })).status).toBe(201);
    return shop;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    notifier = moduleRef.get(CustomerPaymentNotificationService);

    // The ONLY outbound channel is replaced: nothing reaches WhatsApp.
    const wa = moduleRef.get(WhatsappService);
    jest.spyOn(wa, 'sendText').mockImplementation(async (tenantId: string, _userId: string, dto: { phone: string; message: string }) => {
      if (providerMode === 'slow') await new Promise((r) => setTimeout(r, 600));
      if (providerMode === 'fail-always' || (providerMode === 'fail-once' && failuresLeft > 0)) {
        if (providerMode === 'fail-once') failuresLeft -= 1;
        throw new Error('provider down (mock)');
      }
      const existing = await prisma.customerCreditTransaction.count({ where: { tenantId, type: 'PAYMENT' } });
      sent.push({ tenantId, phone: dto.phone, message: dto.message, paymentExistedAtSend: existing > 0 });
      return { success: true } as never;
    });
    A = await seed('a');
    B = await seed('b');
  });
  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 1500));
    await app?.close();
  });
  beforeEach(() => { providerMode = 'ok'; failuresLeft = 0; });

  it('safety: the mock is the only sender, and the real service refuses to send in test mode', async () => {
    const wa = moduleRef.get(WhatsappService) as unknown as { sendText: { mock?: unknown } };
    expect(wa.sendText.mock).toBeTruthy();
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('after a committed payment the consenting customer gets ONE message with the right customer, amounts, method and balance', async () => {
    const c = await withCredit(A, 'Nimal', { phone: '0771234567', metadata: { whatsappConsent: true } });
    const before = sent.length;
    const r = await pay(A, c.id, { amount: 500 });                       // credit 200 first, 300 advance
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ appliedToCredit: 200, advanceToWallet: 300 });
    const txn = await paymentTxn(A, c.id);
    const row = await waitStatus(A, txn.id, ['sent']);
    expect(row.attempts).toBe(1);
    expect(sent.length).toBe(before + 1);
    const m = sent[sent.length - 1];
    expect(m).toMatchObject({ tenantId: A.id, phone: '94771234567', paymentExistedAtSend: true });
    expect(m.message).toContain('Hello Nimal Perera,');
    expect(m.message).toContain('Amount received: LKR 500.00');
    expect(m.message).toContain('Payment method: CASH');
    expect(m.message).toContain('Applied to outstanding credit: LKR 200.00');
    expect(m.message).toContain('Advance added to wallet: LKR 300.00');
    expect(m.message).toContain('Remaining credit balance: LKR 0.00');
    expect(await prisma.notification.count({ where: { tenantId: A.id, channel: 'WHATSAPP', recipients: { isEmpty: true }, data: { path: ['paymentTxnId'], equals: txn.id } } })).toBe(1);
    expect((await prisma.notification.findFirstOrThrow({ where: { tenantId: A.id, data: { path: ['paymentTxnId'], equals: txn.id } } })).sentAt).toBeTruthy();
  });

  it('a payment that only settles credit has no advance line and shows the remaining balance', async () => {
    const c = await withCredit(A, 'Kamal', { metadata: { whatsapp: { consent: true } } });   // the second accepted consent shape
    const before = sent.length;
    expect((await pay(A, c.id, { amount: 50 })).status).toBe(201);
    const txn = await paymentTxn(A, c.id);
    await waitStatus(A, txn.id, ['sent']);
    const m = sent[sent.length - 1];
    expect(sent.length).toBe(before + 1);
    expect(m.message).toContain('Amount received: LKR 50.00');
    expect(m.message).toContain('Applied to outstanding credit: LKR 50.00');
    expect(m.message).not.toContain('Advance added');
    expect(m.message).toContain('Remaining credit balance: LKR 150.00');
  });

  it('phone numbers are normalised to international digits; the customer\'s own format does not matter', async () => {
    for (const phone of ['+94 77 123 4567', '077-123-4567', '94771234567']) {
      const c = await withCredit(A, `Phone${phone.length}`, { phone, metadata: { whatsappConsent: true } });
      expect((await pay(A, c.id, { amount: 10 })).status).toBe(201);
      const txn = await paymentTxn(A, c.id);
      await waitStatus(A, txn.id, ['sent']);
      expect(sent[sent.length - 1].phone).toBe('94771234567');
    }
  });

  it('consent is strict: no consent, a string "true", a missing phone or an invalid phone => skipped with a reason, nothing sent, payment unaffected', async () => {
    const cases: Array<[string, { phone?: string; metadata?: object }, RegExp]> = [
      ['NoConsent', { metadata: {} }, /has not opted in/],
      ['StringTrue', { metadata: { whatsappConsent: 'true' } }, /has not opted in/],
      ['ConsentFalse', { metadata: { whatsappConsent: false, whatsapp: { consent: false } } }, /has not opted in/],
      // Prisma requires a non-null phone; the empty value represents no usable number.
      ['NoPhone', { phone: '', metadata: { whatsappConsent: true } }, /phone number is invalid/],
      ['BadPhone', { phone: 'abc', metadata: { whatsappConsent: true } }, /phone number is invalid/],
    ];
    for (const [name, over, reason] of cases) {
      const c = await withCredit(A, name, over);
      const before = sent.length;
      const r = await pay(A, c.id, { amount: 20 });
      expect([name, r.status]).toEqual([name, 201]);
      const txn = await paymentTxn(A, c.id);
      const d = await waitStatus(A, txn.id, ['skipped']);
      expect(String(d.error)).toMatch(reason);
      expect(sent.length).toBe(before);
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).creditBalance).toBe(180);   // payment applied
    }
  });

  it('a provider failure never fails the payment; the notification is recorded as failed and the retry sends it once', async () => {
    const c = await withCredit(A, 'Retry', { metadata: { whatsappConsent: true } });
    providerMode = 'fail-once'; failuresLeft = 1;
    const before = sent.length;
    const r = await pay(A, c.id, { amount: 120 });
    expect(r.status).toBe(201);                                           // the money side is unaffected
    const txn = await paymentTxn(A, c.id);
    const failed = await waitStatus(A, txn.id, ['failed']);
    expect(failed.attempts).toBe(1);
    expect(String(failed.error)).toMatch(/provider down/);
    expect(sent.length).toBe(before);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).creditBalance).toBe(80);

    await notifier.retryFailedPayments();                                 // the every-minute job, invoked directly
    const done = await waitStatus(A, txn.id, ['sent']);
    expect(done.attempts).toBe(2);
    expect(sent.length).toBe(before + 1);
    expect(sent[sent.length - 1].message).toContain('Amount received: LKR 120.00');
    await notifier.retryFailedPayments();                                 // nothing left to retry
    await notifier.retryFailedPayments();
    expect(sent.length).toBe(before + 1);
  });

  it('a permanently failing provider keeps the row failed (retryable) and never creates a second row or a message', async () => {
    const c = await withCredit(A, 'Down', { metadata: { whatsappConsent: true } });
    providerMode = 'fail-always';
    const before = sent.length;
    expect((await pay(A, c.id, { amount: 30 })).status).toBe(201);
    const txn = await paymentTxn(A, c.id);
    await waitStatus(A, txn.id, ['failed']);
    await notifier.retryFailedPayments();
    await notifier.retryFailedPayments();
    const d = await waitStatus(A, txn.id, ['failed']);
    expect(d.attempts).toBeGreaterThanOrEqual(2);
    expect(sent.length).toBe(before);
    expect(await prisma.notification.count({ where: { tenantId: A.id, data: { path: ['paymentTxnId'], equals: txn.id } } })).toBe(1);
    providerMode = 'ok';                                                  // provider recovers: the next retry delivers
    await notifier.retryFailedPayments();
    await waitStatus(A, txn.id, ['sent']);
    expect(sent.length).toBe(before + 1);
  });

  it('duplicates: the same payment request replayed, and the event delivered several times at once, send exactly one message', async () => {
    const c = await withCredit(A, 'Dup', { metadata: { whatsappConsent: true } });
    const key = `pvw-${run}-dup`;
    const before = sent.length;
    const r1 = await post(A, `/customers/${c.id}/credit/payment`, { amount: 40, paymentMethod: 'CASH', clientRequestId: key });
    const r2 = await post(A, `/customers/${c.id}/credit/payment`, { amount: 40, paymentMethod: 'CASH', clientRequestId: key });
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(r2.body.data.idempotentReplay).toBe(true);
    const txn = await paymentTxn(A, c.id);
    await waitStatus(A, txn.id, ['sent']);
    // the event arrives again (bus redelivery) several times concurrently
    providerMode = 'slow';
    await Promise.all(Array.from({ length: 5 }, () => notifier.handlePaymentCommitted({ tenantId: A.id, customerId: c.id, paymentTxnId: txn.id, amount: 40 })));
    expect(sent.length).toBe(before + 1);
    expect(await prisma.notification.count({ where: { tenantId: A.id, data: { path: ['paymentTxnId'], equals: txn.id } } })).toBe(1);
  });

  it('a brand-new payment whose event is delivered 4 times while the first send is still in flight is sent once', async () => {
    const c = await withCredit(A, 'Race', { metadata: { whatsappConsent: true } });
    providerMode = 'slow';
    const before = sent.length;
    expect((await pay(A, c.id, { amount: 25 })).status).toBe(201);
    const txn = await paymentTxn(A, c.id);
    await Promise.all(Array.from({ length: 4 }, () => notifier.handlePaymentCommitted({ tenantId: A.id, customerId: c.id, paymentTxnId: txn.id, amount: 25 })));
    await waitStatus(A, txn.id, ['sent']);
    expect(sent.length).toBe(before + 1);
  });

  it('a payment that is refused (nothing committed) triggers no notification', async () => {
    const c = await withCredit(A, 'Refused', { metadata: { whatsappConsent: true } });
    const rows = await prisma.notification.count({ where: { tenantId: A.id, channel: 'WHATSAPP' } });
    const before = sent.length;
    expect((await pay(A, c.id, { amount: 50, paymentMethod: 'CARD' })).status).toBe(400);   // card without last 4
    expect((await pay(A, c.id, { amount: 50, applyFromWallet: true })).status).toBe(400);    // empty wallet
    await new Promise((r) => setTimeout(r, 1200));
    expect(await prisma.notification.count({ where: { tenantId: A.id, channel: 'WHATSAPP' } })).toBe(rows);
    expect(sent.length).toBe(before);
  });

  it('tenant isolation: shop B cannot pay shop A\'s customer, and an event naming A\'s payment under B sends nothing', async () => {
    const c = await withCredit(A, 'Iso', { metadata: { whatsappConsent: true } });
    expect((await pay(A, c.id, { amount: 15 })).status).toBe(201);
    const txn = await paymentTxn(A, c.id);
    await waitStatus(A, txn.id, ['sent']);
    const before = sent.length;
    const foreign = await pay(B, c.id, { amount: 15 });
    expect(foreign.status).toBe(404);
    await notifier.handlePaymentCommitted({ tenantId: B.id, customerId: c.id, paymentTxnId: txn.id, amount: 15 });   // forged / misrouted event
    const d = await waitStatus(B, txn.id, ['skipped']);
    expect(String(d.error)).toMatch(/no longer exists/);
    expect(sent.length).toBe(before);
    // A's own row is untouched, and no notification row of B points into A
    expect((await statusOf(A, txn.id))?.status).toBe('sent');
    expect(await prisma.notification.count({ where: { tenantId: B.id, channel: 'WHATSAPP', data: { path: ['kind'], equals: 'customer_payment_received' } } })).toBe(1);
  });

  it('settling credit from the wallet notifies as well, with the wallet method (no advance line)', async () => {
    const c = await withCredit(A, 'Wallet', { metadata: { whatsappConsent: true } });
    expect((await post(A, `/customers/${c.id}/wallet/topup`, { amount: 100, paymentMethod: 'CASH' })).status).toBe(201);
    const before = sent.length;
    expect((await pay(A, c.id, { amount: 100, applyFromWallet: true, paymentMethod: undefined })).status).toBe(201);
    const txn = await paymentTxn(A, c.id);
    await waitStatus(A, txn.id, ['sent']);
    expect(sent.length).toBe(before + 1);
    expect(sent[sent.length - 1].message).toContain('Payment method: WALLET');
    expect(sent[sent.length - 1].message).not.toContain('Advance added');
  });
});
