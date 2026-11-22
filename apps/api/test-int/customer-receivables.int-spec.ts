/**
 * Part 1 - customer receivables against REAL PostgreSQL (throw-away database, see jest-int.config.ts).
 * Proves: the reconciliation law, FIFO allocation, partial / full / advance payments, idempotency and conflicting
 * request keys, concurrent-payment safety, cash book only for physical cash (and a consistent running balance under
 * concurrency), the transactional GL outbox, refund reversal, and tenant isolation.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomerCreditService } from '@/modules/customers/customer-credit.service';
import { addCharge, connectPrisma, describeInt, reconcileCustomer, seedCustomer, seedTenant, SeededTenant } from './helpers/db';

describeInt('customer receivables (real DB)', () => {
  let prisma: PrismaService;
  let svc: CustomerCreditService;
  let emitter: EventEmitter2;
  const emitted: unknown[] = [];

  beforeAll(async () => {
    prisma = await connectPrisma();
    emitter = new EventEmitter2();
    emitter.onAny((_e, payload) => emitted.push(payload));
    svc = new CustomerCreditService(prisma, emitter, {} as never);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  let shop: SeededTenant;
  let seq = 0;
  const key = () => `int-req-${Date.now().toString(36)}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;
  const pay = (customerId: string, amount: number, method: string = 'CASH', extra: object = {}) =>
    svc.receiveCreditPayment(customerId, shop.tenantId, amount, 'int payment', {
      clientRequestId: key(), paymentMethod: method, branchId: shop.branchId, userId: shop.userId, ...extra,
    });
  const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  beforeEach(async () => { shop = await seedTenant(prisma, 'rcv'); emitted.length = 0; });

  it('credit sales + partial + full payments keep: balance = charges - allocated payments', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-01'));
    await addCharge(prisma, shop.tenantId, c.id, 500, D('2026-11-10'));

    let r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 1500, ledgerBalance: 1500, openOnCharges: 1500 });

    await pay(c.id, 400); // partial
    r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 1100, ledgerBalance: 1100, openOnCharges: 1100, paymentsAndCreditNotes: 400, allocatedOnCharges: 400 });

    await pay(c.id, 1100, 'BANK_TRANSFER'); // full settlement of the rest
    r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 0, ledgerBalance: 0, openOnCharges: 0, paymentsAndCreditNotes: 1500, walletBalance: 0 });
    const open = await prisma.customerCreditTransaction.count({ where: { tenantId: shop.tenantId, type: 'CHARGE', status: { in: ['OPEN', 'PARTIAL'] } } });
    expect(open).toBe(0);
  });

  it('FIFO: the oldest due charge is cleared first, regardless of creation order', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    const newer = await addCharge(prisma, shop.tenantId, c.id, 500, D('2026-12-01'));
    const older = await addCharge(prisma, shop.tenantId, c.id, 300, D('2026-10-01'));
    const res = await pay(c.id, 350);
    expect(res.allocations.map((a) => a.chargeId)).toEqual([older.id, newer.id]);
    const [o, n] = await Promise.all([
      prisma.customerCreditTransaction.findUniqueOrThrow({ where: { id: older.id } }),
      prisma.customerCreditTransaction.findUniqueOrThrow({ where: { id: newer.id } }),
    ]);
    expect([o.status, o.paidAmount, n.status, n.paidAmount]).toEqual(['PAID', 300, 'PARTIAL', 50]);
    expect(await reconcileCustomer(prisma, shop.tenantId, c.id)).toMatchObject({ customerBalance: 450, ledgerBalance: 450 });
  });

  it('advance: an overpayment settles the debt and the rest goes to the wallet (never to a negative balance)', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 200, D('2026-11-01'));
    const res = await pay(c.id, 500);
    expect(res).toMatchObject({ appliedToCredit: 200, advanceToWallet: 300, creditBalance: 0, walletBalance: 300 });
    const r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 0, ledgerBalance: 0, walletBalance: 300 });
    const wt = await prisma.walletTransaction.findMany({ where: { tenantId: shop.tenantId, customerId: c.id } });
    expect(wt).toEqual([expect.objectContaining({ type: 'ADVANCE', amount: 300 })]);
  });

  it('advance can then be applied to new debt from the wallet', async () => {
    const c = await seedCustomer(prisma, shop.tenantId, { walletBalance: 0 });
    await pay(c.id, 400); // no debt: all advance
    await addCharge(prisma, shop.tenantId, c.id, 250, D('2026-11-20'));
    const res = await pay(c.id, 250, 'WALLET', { applyFromWallet: true });
    expect(res).toMatchObject({ appliedToCredit: 250, creditBalance: 0, walletBalance: 150 });
    expect(await reconcileCustomer(prisma, shop.tenantId, c.id)).toMatchObject({ customerBalance: 0, ledgerBalance: 0, walletBalance: 150 });
  });

  it('duplicate request: the same key returns the original result and changes nothing', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 900, D('2026-11-01'));
    const k = key();
    const opts = { clientRequestId: k, paymentMethod: 'CASH', branchId: shop.branchId, userId: shop.userId };
    const first = await svc.receiveCreditPayment(c.id, shop.tenantId, 300, 'int payment', opts);
    const replay = await svc.receiveCreditPayment(c.id, shop.tenantId, 300, 'int payment', opts);
    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(await reconcileCustomer(prisma, shop.tenantId, c.id)).toMatchObject({ customerBalance: 600, paymentsAndCreditNotes: 300 });
    expect(await prisma.cashBookEntry.count({ where: { tenantId: shop.tenantId } })).toBe(1);
    expect(await prisma.accountingOutboxEvent.count({ where: { tenantId: shop.tenantId, sourceType: 'CUSTOMER_CREDIT_PAYMENT' } })).toBe(1);
  });

  it('the same key with different details is refused (409) and writes nothing', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 900, D('2026-11-01'));
    const k = key();
    await svc.receiveCreditPayment(c.id, shop.tenantId, 300, 'int payment', { clientRequestId: k, paymentMethod: 'CASH' });
    await expect(svc.receiveCreditPayment(c.id, shop.tenantId, 301, 'int payment', { clientRequestId: k, paymentMethod: 'CASH' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect((await reconcileCustomer(prisma, shop.tenantId, c.id)).customerBalance).toBe(600);
  });

  it('concurrent payments (10 at once, different keys) never lose or double-apply an amount', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-01'));
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-05'));
    await Promise.all(Array.from({ length: 10 }, () => pay(c.id, 100)));
    const r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 1000, ledgerBalance: 1000, paymentsAndCreditNotes: 1000, allocatedOnCharges: 1000, openOnCharges: 1000 });
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: shop.tenantId, type: 'PAYMENT' } })).toBe(10);
  });

  it('concurrent retries of the SAME request key record exactly one payment', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-01'));
    const k = key();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => svc.receiveCreditPayment(c.id, shop.tenantId, 250, 'int payment', { clientRequestId: k, paymentMethod: 'CASH', branchId: shop.branchId })),
    );
    expect(results.every((x) => x.status === 'fulfilled')).toBe(true);
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: shop.tenantId, type: 'PAYMENT' } })).toBe(1);
    expect((await reconcileCustomer(prisma, shop.tenantId, c.id)).customerBalance).toBe(750);
  });

  it('cash book: only CASH is a physical cash movement; CARD / QR / BANK / UPI never touch it', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 5000, D('2026-11-01'));
    await pay(c.id, 100, 'CARD', { cardLast4: '4242' });
    await pay(c.id, 100, 'QR');
    await pay(c.id, 100, 'BANK_TRANSFER');
    await pay(c.id, 100, 'UPI');
    expect(await prisma.cashBookEntry.count({ where: { tenantId: shop.tenantId } })).toBe(0);
    await pay(c.id, 100, 'CASH');
    const rows = await prisma.cashBookEntry.findMany({ where: { tenantId: shop.tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ debit: 100, paymentMethod: 'CASH', balanceAfter: 100 });
  });

  it('cash book: concurrent cash collections keep a consistent running balance (no lost / duplicated balanceAfter)', async () => {
    const c1 = await seedCustomer(prisma, shop.tenantId);
    const c2 = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c1.id, 5000, D('2026-11-01'));
    await addCharge(prisma, shop.tenantId, c2.id, 5000, D('2026-11-01'));
    await Promise.all(Array.from({ length: 12 }, (_, i) => pay(i % 2 ? c1.id : c2.id, 50 + i)));
    const rows = await prisma.cashBookEntry.findMany({ where: { tenantId: shop.tenantId, branchId: shop.branchId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    expect(rows).toHaveLength(12);
    let running = 0;
    for (const row of rows) {
      running = Math.round((running + row.debit - row.credit) * 100) / 100;
      expect(row.balanceAfter).toBe(running);
    }
    const total = Array.from({ length: 12 }, (_, i) => 50 + i).reduce((a, b) => a + b, 0);
    expect(rows[rows.length - 1].balanceAfter).toBe(total);
  });

  it('transactional outbox: every payment has exactly one PENDING GL intent carrying its tender method', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-01'));
    const r1 = await pay(c.id, 200, 'CARD', { cardLast4: '4242' });
    const r2 = await pay(c.id, 300, 'CASH');
    expect(r1.appliedToCredit + r2.appliedToCredit).toBe(500);
    const outbox = await prisma.accountingOutboxEvent.findMany({ where: { tenantId: shop.tenantId, sourceType: 'CUSTOMER_CREDIT_PAYMENT' }, orderBy: { createdAt: 'asc' } });
    expect(outbox).toHaveLength(2);
    expect(outbox.every((o) => o.status === 'PENDING')).toBe(true);
    expect(outbox.map((o) => (o.payload as { method: string }).method)).toEqual(['CARD', 'CASH']);
    const paymentIds = (await prisma.customerCreditTransaction.findMany({ where: { tenantId: shop.tenantId, type: 'PAYMENT' } })).map((p) => p.id).sort();
    expect(outbox.map((o) => o.sourceId).sort()).toEqual(paymentIds);
  });

  it('a payment that fails rolls back EVERYTHING - balance, allocations, cash book and outbox', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 500, D('2026-11-01'));
    // An invalid cheque due date makes the cheque insert fail INSIDE the transaction, i.e. after the customer balance,
    // the charge allocation and the payment row were already written.
    await expect(svc.receiveCreditPayment(c.id, shop.tenantId, 200, 'int cheque', {
      clientRequestId: key(), paymentMethod: 'CHEQUE', chequeNumber: 'CHQ-1', chequeDueDate: 'not-a-date', branchId: shop.branchId,
    })).rejects.toThrow();
    expect(await reconcileCustomer(prisma, shop.tenantId, c.id)).toMatchObject({ customerBalance: 500, paymentsAndCreditNotes: 0, allocatedOnCharges: 0 });
    expect(await prisma.accountingOutboxEvent.count({ where: { tenantId: shop.tenantId } })).toBe(0);
    expect(await prisma.customerCreditTransaction.count({ where: { tenantId: shop.tenantId, type: 'PAYMENT' } })).toBe(0);
  });

  it('refund / return reversal: credit is reversed on the open charge and the law still holds', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    const saleId = `sale-${key()}`;
    await addCharge(prisma, shop.tenantId, c.id, 800, D('2026-11-01'), saleId);
    await pay(c.id, 300);
    const res = await prisma.$transaction((tx) => svc.reverseCreditForSaleReturn(shop.tenantId, saleId, 200, 'int return', tx));
    expect(res.reversed).toBe(200);
    const r = await reconcileCustomer(prisma, shop.tenantId, c.id);
    expect(r).toMatchObject({ customerBalance: 300, ledgerBalance: 300, openOnCharges: 300, paymentsAndCreditNotes: 500 });
    // asking to reverse more than is still open only reverses what is open (the caller refunds the rest as store credit)
    const more = await prisma.$transaction((tx) => svc.reverseCreditForSaleReturn(shop.tenantId, saleId, 1000, 'int return 2', tx));
    expect(more.reversed).toBe(300);
    expect((await reconcileCustomer(prisma, shop.tenantId, c.id)).customerBalance).toBe(0);
  });

  it('tenant isolation: another shop can neither pay nor see this customer', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 500, D('2026-11-01'));
    const other = await seedTenant(prisma, 'rcv-other');
    await expect(svc.receiveCreditPayment(c.id, other.tenantId, 100, 'steal', { clientRequestId: key(), paymentMethod: 'CASH' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect((await reconcileCustomer(prisma, shop.tenantId, c.id)).customerBalance).toBe(500);
    expect(await prisma.cashBookEntry.count({ where: { tenantId: other.tenantId } })).toBe(0);
  });

  it('immutable history: payment rows are never rewritten by later payments', async () => {
    const c = await seedCustomer(prisma, shop.tenantId);
    await addCharge(prisma, shop.tenantId, c.id, 1000, D('2026-11-01'));
    await pay(c.id, 100);
    const before = await prisma.customerCreditTransaction.findFirstOrThrow({ where: { tenantId: shop.tenantId, type: 'PAYMENT' } });
    await pay(c.id, 200);
    const after = await prisma.customerCreditTransaction.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
  });
});
