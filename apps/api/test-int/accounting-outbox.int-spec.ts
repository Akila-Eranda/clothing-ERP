/**
 * Part 1 / Part 8 - the accounting outbox against REAL PostgreSQL: a committed business record always reaches the
 * ledger (retry, stale-worker recovery, attempt cap) and is posted exactly once even with concurrent workers.
 * The GL posting itself is stubbed here (its maths is covered by accounting-posting.service.spec); this proves the
 * delivery guarantees.
 */
import { AccountingOutboxService } from '@/modules/accounting/accounting-outbox.service';
import { enqueueOutboxInTx } from '@/modules/accounting/accounting-outbox.tx';
import { PrismaService } from '@/prisma/prisma.service';
import { connectPrisma, describeInt, seedTenant, SeededTenant } from './helpers/db';

describeInt('accounting outbox (real DB)', () => {
  let prisma: PrismaService;
  let shop: SeededTenant;
  let posting: { postCustomerCreditPayment: jest.Mock; postSale: jest.Mock };
  let outbox: AccountingOutboxService;

  beforeAll(async () => { prisma = await connectPrisma(); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    // the sweep is global (all tenants), so start every test from an empty outbox (safe: the DB is the guarded throw-away one)
    await prisma.accountingOutboxEvent.deleteMany();
    shop = await seedTenant(prisma, 'obx');
    posting = {
      postCustomerCreditPayment: jest.fn(async () => ({ journalId: 'jrnl-1' })),
      postSale: jest.fn(async () => ({ journalId: 'jrnl-sale' })),
    };
    outbox = new AccountingOutboxService(prisma, posting as never);
  });

  const queue = (sourceId: string, type = 'CUSTOMER_CREDIT_PAYMENT') =>
    prisma.$transaction((tx) => enqueueOutboxInTx(tx, shop.tenantId, type, sourceId, { tenantId: shop.tenantId, amount: 10, applied: 10, advance: 0, method: 'CASH', customerId: 'c' }));
  const age = (id: string, seconds: number) =>
    prisma.$executeRaw`UPDATE accounting_outbox_events SET "createdAt" = now() - (${seconds} * interval '1 second'), "updatedAt" = now() - (${seconds} * interval '1 second') WHERE id = ${id}`;

  it('the intent is written inside the caller transaction: a rolled-back transaction leaves no outbox row', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await enqueueOutboxInTx(tx, shop.tenantId, 'CUSTOMER_CREDIT_PAYMENT', 'pay-rb', {});
      throw new Error('business failure');
    })).rejects.toThrow('business failure');
    expect(await prisma.accountingOutboxEvent.count({ where: { tenantId: shop.tenantId } })).toBe(0);
  });

  it('enqueue is idempotent (same source twice = one row) and never resets a POSTED event', async () => {
    const a = await queue('pay-1');
    const b = await queue('pay-1');
    expect(b.id).toBe(a.id);
    await outbox.processOne(a.id, shop.tenantId);
    await queue('pay-1');
    const row = await prisma.accountingOutboxEvent.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe('POSTED');
    expect(posting.postCustomerCreditPayment).toHaveBeenCalledTimes(1);
  });

  it('sweep posts a committed intent the fast path never delivered (process died after commit)', async () => {
    const ev = await queue('pay-lost');
    await age(ev.id, 300);
    const r = await outbox.sweep();
    expect(r).toMatchObject({ picked: 1, posted: 1, failed: 0 });
    expect((await prisma.accountingOutboxEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe('POSTED');
  });

  it('sweep leaves brand-new rows to the fast path (min age)', async () => {
    await queue('pay-new');
    expect(await outbox.sweep({ minAgeSeconds: 60 })).toMatchObject({ picked: 0 });
    expect(posting.postCustomerCreditPayment).not.toHaveBeenCalled();
  });

  it('a posting failure is recorded and retried by the next sweep until it succeeds', async () => {
    posting.postCustomerCreditPayment.mockRejectedValueOnce(new Error('GL temporarily unavailable'));
    const ev = await queue('pay-retry');
    await age(ev.id, 300);
    expect(await outbox.sweep()).toMatchObject({ failed: 1, posted: 0 });
    let row = await prisma.accountingOutboxEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect([row.status, row.attempts, row.lastError]).toEqual(['FAILED', 1, 'GL temporarily unavailable']);
    expect(await outbox.sweep()).toMatchObject({ posted: 1 });
    row = await prisma.accountingOutboxEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect([row.status, row.attempts]).toEqual(['POSTED', 2]);
  });

  it('recovers a row left in PROCESSING by a crashed worker', async () => {
    const ev = await queue('pay-stale');
    await prisma.accountingOutboxEvent.update({ where: { id: ev.id }, data: { status: 'PROCESSING', attempts: 1 } });
    await age(ev.id, 20 * 60);
    expect(await outbox.sweep({ stuckMinutes: 10 })).toMatchObject({ recovered: 1, posted: 1 });
    // a worker that is still genuinely busy (recent update) is NOT disturbed
    const busy = await queue('pay-busy');
    await prisma.accountingOutboxEvent.update({ where: { id: busy.id }, data: { status: 'PROCESSING' } });
    expect(await outbox.sweep({ stuckMinutes: 10 })).toMatchObject({ recovered: 0 });
  });

  it('stops retrying after the attempt cap (needs a human, stays visible as FAILED)', async () => {
    posting.postCustomerCreditPayment.mockRejectedValue(new Error('permanent'));
    const ev = await queue('pay-cap');
    await age(ev.id, 300);
    for (let i = 0; i < 5; i++) await outbox.sweep({ maxAttempts: 3 });
    const row = await prisma.accountingOutboxEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect([row.status, row.attempts]).toEqual(['FAILED', 3]);
  });

  it('concurrent workers post each event exactly once', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) { const e = await queue(`pay-c-${i}`); await age(e.id, 300); ids.push(e.id); }
    posting.postCustomerCreditPayment.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 25)); return { journalId: 'j' }; });
    await Promise.all([outbox.sweep(), outbox.sweep(), outbox.sweep(), outbox.sweep()]);
    expect(posting.postCustomerCreditPayment).toHaveBeenCalledTimes(6);
    const rows = await prisma.accountingOutboxEvent.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.status === 'POSTED' && r.attempts === 1)).toBe(true);
  });

  it('tenant isolation: processing is always scoped to the event\'s own tenant', async () => {
    const other = await seedTenant(prisma, 'obx-other');
    const ev = await queue('pay-iso');
    await expect(outbox.processOne(ev.id, other.tenantId)).rejects.toThrow('Outbox event not found');
  });
});
