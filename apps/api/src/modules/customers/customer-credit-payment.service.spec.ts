import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { CustomerCreditService } from './customer-credit.service';

function createService(
  initialCreditBalance: number,
  chargeFixtures?: Array<{
    id: string;
    amount: number;
    paidAmount: number;
    dueDate: Date | null;
    createdAt: Date;
  }>,
) {
  const account = {
    id: 'customer-1',
    firstName: 'Test',
    lastName: 'Customer',
    walletBalance: 0,
    creditBalance: initialCreditBalance,
    creditLimit: 1000,
  };
  const charges = chargeFixtures ?? (initialCreditBalance > 0
    ? [{ id: 'charge-1', amount: initialCreditBalance, paidAmount: 0, dueDate: null, createdAt: new Date('2026-11-01T00:00:00.000Z') }]
    : []);
  let paymentRow: { id: string; referenceId: string; amount: number } | null = null;
  const walletRows: Array<{ id: string; type: string; amount: number; referenceId: string }> = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    accountingOutboxEvent: { upsert: jest.fn().mockResolvedValue({}) },
    customer: {
      findFirst: jest.fn(async () => ({ ...account })),
      updateMany: jest.fn(async ({ data }: { data: { creditBalance?: { decrement: number }; walletBalance?: { increment?: number; decrement?: number } } }) => {
        account.creditBalance -= data.creditBalance?.decrement ?? 0;
        account.walletBalance += data.walletBalance?.increment ?? 0;
        account.walletBalance -= data.walletBalance?.decrement ?? 0;
        return { count: 1 };
      }),
    },
    customerCreditTransaction: {
      findFirst: jest.fn(async () => paymentRow),
      findMany: jest.fn(async () => charges),
      create: jest.fn(async ({ data }: { data: { referenceId: string; amount: number } }) => {
        const row = { id: 'payment-1', referenceId: data.referenceId, amount: data.amount };
        paymentRow = row;
        return { id: row.id };
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    walletTransaction: {
      findMany: jest.fn(async () => walletRows),
      create: jest.fn(async ({ data }: { data: { type: string; amount: number; referenceId: string } }) => {
        const row = { id: `wallet-${walletRows.length + 1}`, ...data };
        walletRows.push(row);
        return row;
      }),
    },
    customerCreditScheduleLine: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    customerCreditSchedule: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    cashBookEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    cheque: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  const eventEmitter = { emit: jest.fn() };
  const service = new CustomerCreditService(
    prisma as unknown as PrismaService,
    eventEmitter as unknown as EventEmitter2,
    {} as NotificationsService,
  );
  return { service, tx, prisma, account, walletRows, eventEmitter };
}

describe('CustomerCreditService payment allocation', () => {
  it('settles multiple open charges in due-date order before creating any wallet advance', async () => {
    const charges = [
      {
        id: 'older-charge',
        amount: 300,
        paidAmount: 100,
        dueDate: new Date('2026-10-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        id: 'newer-charge',
        amount: 500,
        paidAmount: 0,
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
        createdAt: new Date('2026-10-15T00:00:00.000Z'),
      },
    ];
    const { service, tx, account, walletRows } = createService(700, charges);

    const result = await service.receiveCreditPayment('customer-1', 'tenant-1', 250, 'Customer payment', {
      clientRequestId: 'fifo-payment-1',
      paymentMethod: 'CASH',
    });

    expect(result).toMatchObject({
      appliedToCredit: 250,
      advanceToWallet: 0,
      creditBalance: 450,
      walletBalance: 0,
    });
    expect(account).toMatchObject({ creditBalance: 450, walletBalance: 0 });
    expect(tx.customerCreditTransaction.update.mock.calls).toEqual([
      [
        {
          where: { id: 'older-charge' },
          data: { paidAmount: 300, status: 'PAID' },
        },
      ],
      [
        {
          where: { id: 'newer-charge' },
          data: { paidAmount: 50, status: 'PARTIAL' },
        },
      ],
    ]);
    expect(walletRows).toEqual([]);
  });

  it('settles outstanding credit first, credits overpayment to wallet, and preserves the tender posting', async () => {
    const { service, tx, account, walletRows, eventEmitter } = createService(500);
    const options = { clientRequestId: 'payment-request-1', paymentMethod: 'CASH' as const };

    const result = await service.receiveCreditPayment('customer-1', 'tenant-1', 1000, 'Customer payment', options);

    expect(result).toMatchObject({ appliedToCredit: 500, advanceToWallet: 500, creditBalance: 0, walletBalance: 500 });
    expect(account).toMatchObject({ creditBalance: 0, walletBalance: 500 });
    expect(walletRows).toEqual([expect.objectContaining({ type: 'ADVANCE', amount: 500 })]);
    expect(tx.cashBookEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ debit: 1000, paymentMethod: 'CASH' }),
    }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);

    const retry = await service.receiveCreditPayment('customer-1', 'tenant-1', 1000, 'Customer payment', options);
    expect(retry).toMatchObject({ idempotentReplay: true, appliedToCredit: 500, advanceToWallet: 500, creditBalance: 0, walletBalance: 500 });
    expect(tx.customer.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.cashBookEntry.create).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });

  it('credits the full payment to wallet when there is no outstanding credit', async () => {
    const { service, tx, account, walletRows } = createService(0);

    const result = await service.receiveCreditPayment('customer-1', 'tenant-1', 1000, 'Customer advance', {
      clientRequestId: 'advance-request-1',
      paymentMethod: 'CARD',
      cardLast4: '1234',
    });

    expect(result).toMatchObject({ appliedToCredit: 0, advanceToWallet: 1000, creditBalance: 0, walletBalance: 1000 });
    expect(account.walletBalance).toBe(1000);
    expect(walletRows).toEqual([expect.objectContaining({ type: 'ADVANCE', amount: 1000 })]);
    expect(tx.customerCreditTransaction.create).not.toHaveBeenCalled();
    // Policy (Part 1): a CARD collection is NOT a physical cash movement - it settles through the card clearing /
    // bank account in the general ledger (outbox row below), never through the drawer's cash book.
    expect(tx.cashBookEntry.create).not.toHaveBeenCalled();
    expect(tx.accountingOutboxEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sourceType: 'CUSTOMER_CREDIT_PAYMENT',
        payload: expect.objectContaining({ method: 'CARD', amount: 1000, advance: 1000 }),
      }),
    }));
  });

  it('writes the GL outbox row inside the payment transaction (no payment without its accounting intent)', async () => {
    const { service, tx, prisma } = createService(500);
    await service.receiveCreditPayment('customer-1', 'tenant-1', 200, 'Customer payment', {
      clientRequestId: 'outbox-request-1',
      paymentMethod: 'CASH',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.accountingOutboxEvent.upsert).toHaveBeenCalledTimes(1);
    expect(tx.accountingOutboxEvent.upsert.mock.calls[0][0].create).toMatchObject({
      tenantId: 'tenant-1', sourceType: 'CUSTOMER_CREDIT_PAYMENT', sourceId: 'payment-1',
    });
  });

  it('a replayed request writes no second cash-book row and no second outbox row', async () => {
    const { service, tx } = createService(500);
    const options = { clientRequestId: 'replay-request-1', paymentMethod: 'CASH' as const };
    await service.receiveCreditPayment('customer-1', 'tenant-1', 200, 'Customer payment', options);
    await service.receiveCreditPayment('customer-1', 'tenant-1', 200, 'Customer payment', options);
    expect(tx.cashBookEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.accountingOutboxEvent.upsert).toHaveBeenCalledTimes(1);
  });
});
