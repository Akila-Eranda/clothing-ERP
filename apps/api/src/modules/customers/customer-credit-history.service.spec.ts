import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { CustomerCreditService } from './customer-credit.service';
import { encodeCustomerHistoryCursor } from './customer-history.helper';

const customer = {
  id: 'customer-1',
  creditBalance: 60,
  creditLimit: 500,
  walletBalance: 25,
};

function createService() {
  const prisma = {
    customer: { findFirst: jest.fn().mockResolvedValue(customer) },
    sale: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total: 40 } }),
    },
    walletTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    customerCreditTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    return: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CustomerCreditService(
    prisma as unknown as PrismaService,
    {} as EventEmitter2,
    {} as NotificationsService,
  );
  return { service, prisma };
}

describe('CustomerCreditService transaction history', () => {
  it('merges source streams into a stable page and preserves sale tender amounts', async () => {
    const { service, prisma } = createService();
    prisma.sale.findMany.mockResolvedValue([{
      id: 'sale-1',
      invoiceNumber: 'INV-1',
      invoiceDate: new Date('2026-11-01T10:00:00.000Z'),
      total: 35,
      amountPaid: 35,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      payments: [
        { method: 'CASH', amount: 20, reference: null },
        { method: 'CARD', amount: 15, reference: 'ref-1' },
      ],
    }]);
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-1',
      amount: 10,
      type: 'TOP_UP',
      description: 'Wallet top-up',
      referenceId: null,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-11-02T10:00:00.000Z'),
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-1',
      amount: 20,
      paidAmount: 0,
      type: 'CHARGE',
      status: 'OPEN',
      description: 'Credit sale',
      referenceId: null,
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
      dueDate: null,
    }]);
    prisma.return.findMany.mockResolvedValue([{
      id: 'return-1',
      returnNumber: 'RET-1',
      returnType: 'REFUND',
      status: 'COMPLETED',
      totalAmount: 5,
      refundAmount: 5,
      exchangeAmount: 0,
      createdAt: new Date('2026-11-04T10:00:00.000Z'),
      originalSale: { invoiceNumber: 'INV-1' },
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 2);

    expect(result.entries.map((entry) => entry.id)).toEqual(['SALE:sale-1', 'WALLET:wallet-1']);
    expect(result.entries[0].paymentAmounts).toEqual([
      { method: 'CASH', amount: 20 },
      { method: 'CARD', amount: 15 },
    ]);
    expect(result.pageInfo).toEqual({
      limit: 2,
      hasMore: true,
      nextCursor: encodeCustomerHistoryCursor({
        createdAt: new Date('2026-11-02T10:00:00.000Z'),
        id: 'WALLET:wallet-1',
      }),
    });
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1', tenantId: 'tenant-1' },
    }));
    expect(prisma.sale.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      customerId: 'customer-1',
      isReturn: false,
      status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    }));
    expect(prisma.return.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      originalSale: { tenantId: 'tenant-1', customerId: 'customer-1' },
      status: { in: ['COMPLETED', 'REFUND_PROCESSED'] },
    }));
  });

  it('omits branchless wallet and credit streams while marking balances all-branch', async () => {
    const { service, prisma } = createService();
    prisma.sale.findMany.mockResolvedValue([{
      id: 'sale-branch',
      invoiceNumber: 'INV-B',
      invoiceDate: new Date('2026-11-01T10:00:00.000Z'),
      total: 40,
      amountPaid: 40,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      payments: [],
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', 'branch-1');

    expect(result.entries.map((entry) => entry.id)).toEqual(['SALE:sale-branch']);
    expect(result.branchScope).toEqual({
      branchFilterApplied: true,
      walletAndCreditEntriesOmitted: true,
      balancesAreAllBranches: true,
    });
    expect(prisma.sale.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ branchId: 'branch-1' }));
    expect(prisma.return.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ branchId: 'branch-1' }));
    expect(prisma.walletTransaction.findMany).not.toHaveBeenCalled();
    expect(prisma.customerCreditTransaction.findMany).not.toHaveBeenCalled();
  });

  it('calculates wallet and credit running balances from the cursor opening totals', async () => {
    const { service, prisma } = createService();
    const cursor = encodeCustomerHistoryCursor({
      createdAt: new Date('2026-11-02T10:00:00.000Z'),
      id: 'SALE:sale-1',
    });
    prisma.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
    prisma.customerCreditTransaction.groupBy.mockResolvedValue([
      { type: 'CHARGE', _sum: { amount: 100 } },
      { type: 'PAYMENT', _sum: { amount: 40 } },
    ]);
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-2',
      amount: 5,
      type: 'TOP_UP',
      description: 'Wallet top-up',
      referenceId: null,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-2',
      amount: 10,
      paidAmount: 10,
      type: 'PAYMENT',
      status: 'PAID',
      description: 'Credit settlement',
      referenceId: null,
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
      dueDate: null,
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 10, cursor);

    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'CREDIT:credit-2', creditBalanceAfter: 50 }),
      expect.objectContaining({ id: 'WALLET:wallet-2', walletBalanceAfter: 25 }),
    ]));
    expect(prisma.walletTransaction.aggregate.mock.calls[0][0].where).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      customerId: 'customer-1',
    }));
    expect(prisma.customerCreditTransaction.groupBy.mock.calls[0][0].where).toEqual(expect.objectContaining({
      tenantId: 'tenant-1',
      customerId: 'customer-1',
    }));
  });

  it('returns recent account history newest-first with current running balances and hides retry keys', async () => {
    const { service, prisma } = createService();
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-new',
      amount: 5,
      type: 'TOP_UP',
      description: 'Wallet top-up',
      referenceId: 'CUSTOMER_PAYMENT:retry-key:fingerprint',
      paymentMethod: 'CASH',
      createdAt: new Date('2026-11-04T10:00:00.000Z'),
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-new',
      amount: 10,
      paidAmount: 10,
      type: 'PAYMENT',
      status: 'PAID',
      description: 'Payment method: CASH',
      referenceId: 'CUSTOMER_PAYMENT:retry-key:fingerprint',
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
      dueDate: null,
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 5, undefined, true);

    expect(result.entries.map((entry) => entry.id)).toEqual(['WALLET:wallet-new', 'CREDIT:credit-new']);
    expect(result.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'WALLET:wallet-new', walletBalanceAfter: 25, reference: null }),
      expect.objectContaining({ id: 'CREDIT:credit-new', creditBalanceAfter: 60, reference: null }),
    ]));
    expect(prisma.walletTransaction.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('projects wallet and credit movements for one POS sale as a single history entry', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-11-05T10:00:00.000Z');
    prisma.sale.findMany.mockResolvedValue([{
      id: 'sale-account',
      invoiceNumber: 'INV-ACCOUNT',
      invoiceDate: createdAt,
      total: 100,
      amountPaid: 100,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      payments: [
        { method: 'WALLET', amount: 50, reference: null },
        { method: 'CUSTOMER_CREDIT', amount: 50, reference: null },
      ],
    }]);
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-sale',
      amount: -50,
      type: 'SALE_DEBIT',
      description: 'POS sale INV-ACCOUNT',
      referenceId: 'sale-account',
      paymentMethod: null,
      createdAt,
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-sale',
      amount: 50,
      paidAmount: 0,
      type: 'CHARGE',
      status: 'OPEN',
      description: 'POS sale INV-ACCOUNT',
      referenceId: 'sale-account',
      createdAt,
      dueDate: null,
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 5, undefined, true);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'SALE:sale-account',
      category: 'POS_CREDIT_WALLET_PURCHASE',
      walletBalanceAfter: 25,
      creditBalanceAfter: 60,
    });
    expect(result.entries[0].description).toContain('Wallet used LKR 50.00');
    expect(result.entries[0].description).toContain('Credit charged LKR 50.00');
  });

  it('projects a payment and its wallet overpayment allocation as one history entry', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-11-06T10:00:00.000Z');
    const internalReference = 'CUSTOMER_PAYMENT:retry-key:fingerprint';
    prisma.customer.findFirst.mockResolvedValue({ ...customer, creditBalance: 0, walletBalance: 500 });
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-advance',
      amount: 500,
      type: 'ADVANCE',
      description: 'Customer payment — prepaid advance',
      referenceId: internalReference,
      paymentMethod: null,
      createdAt,
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-payment',
      amount: 500,
      paidAmount: 500,
      type: 'PAYMENT',
      status: 'PAID',
      description: 'Customer payment · Payment method: CASH · Reference: REC-1',
      referenceId: internalReference,
      createdAt,
      dueDate: null,
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 5, undefined, true);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'CREDIT:credit-payment',
      category: 'CUSTOMER_OVERPAYMENT',
      amount: 1000,
      reference: 'REC-1',
      walletBalanceAfter: 500,
      creditBalanceAfter: 0,
    });
    expect(result.entries[0].description).toContain('Credit settled LKR 500.00 · Overpayment to wallet LKR 500.00');
  });

  it('projects linked wallet refunds and credit reversals as one return history entry', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-11-07T10:00:00.000Z');
    prisma.customer.findFirst.mockResolvedValue({ ...customer, creditBalance: 200, walletBalance: 100 });
    prisma.return.findMany.mockResolvedValue([{
      id: 'return-account',
      returnNumber: 'RET-ACCOUNT',
      returnType: 'REFUND',
      status: 'COMPLETED',
      totalAmount: 50,
      refundAmount: 50,
      exchangeAmount: 0,
      createdAt,
      originalSale: { invoiceNumber: 'INV-RETURN' },
    }]);
    prisma.walletTransaction.findMany.mockResolvedValue([{
      id: 'wallet-return',
      amount: 30,
      type: 'RETURN_REFUND',
      description: 'Return RET-ACCOUNT (wallet)',
      referenceId: 'return-account',
      paymentMethod: null,
      createdAt,
    }]);
    prisma.customerCreditTransaction.findMany.mockResolvedValue([{
      id: 'credit-return',
      amount: 20,
      paidAmount: 20,
      type: 'CREDIT_NOTE',
      status: 'PAID',
      description: 'Return RET-ACCOUNT credit reversal',
      referenceId: 'sale-return',
      createdAt,
      dueDate: null,
    }]);

    const result = await service.getCustomerTransactionHistory('customer-1', 'tenant-1', undefined, 5, undefined, true);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'RETURN:return-account',
      category: 'REVERSAL',
      walletBalanceAfter: 100,
      creditBalanceAfter: 200,
    });
    expect(result.entries[0].description).toContain('Wallet credited LKR 30.00');
    expect(result.entries[0].description).toContain('Credit reversed LKR 20.00');
  });
});
