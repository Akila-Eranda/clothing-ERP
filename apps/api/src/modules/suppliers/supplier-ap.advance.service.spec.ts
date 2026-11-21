import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { SupplierApService } from './supplier-ap.service';

describe('SupplierApService future advance application', () => {
  it('applies advance to an open received PO without creating a cash payment', async () => {
    let advanceBalance = 300;
    let supplierBalance = 0;
    let committed = false;
    let emittedAfterCommit = false;
    const po = {
      id: 'purchase-1',
      tenantId: 'tenant-1',
      supplierId: 'supplier-1',
      poNumber: 'PO-1',
      status: 'RECEIVED',
      total: 500,
      paidAmount: 0,
      paymentDueDate: new Date('2026-11-30T00:00:00.000Z'),
      orderDate: new Date('2026-11-01T00:00:00.000Z'),
      items: [{ receivedQty: 5, orderedQty: 5, unitCost: 100 }],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      purchaseOrder: {
        findMany: jest.fn().mockImplementation(async () => [po]),
        findFirst: jest.fn().mockImplementation(async () => po),
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(po, data);
          return po;
        }),
      },
      supplierInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ creditDays: 30 }),
        findFirstOrThrow: jest.fn().mockImplementation(async () => ({
          advanceBalance,
          balance: supplierBalance,
        })),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (data.advanceBalance?.decrement !== undefined) {
            if (advanceBalance < where.advanceBalance.gte) return { count: 0 };
            advanceBalance -= data.advanceBalance.decrement;
            return { count: 1 };
          }
          if (data.balance !== undefined) supplierBalance = data.balance;
          return { count: 1 };
        }),
      },
      supplierAdvanceEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'advance-entry-1', ...data })),
      },
      supplierLedgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'ledger-entry-1' }),
      },
      supplierPayment: { create: jest.fn() },
      cashBookEntry: { create: jest.fn() },
    };
    const prisma = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    };
    const eventEmitter = {
      emit: jest.fn(() => {
        emittedAfterCommit = committed;
      }),
    };
    const service = new SupplierApService(
      prisma as unknown as PrismaService,
      eventEmitter as unknown as EventEmitter2,
    );

    const result = await service.applyAdvance('supplier-1', 'tenant-1', 'user-1', {
      amount: 100,
      purchaseIds: ['purchase-1'],
      clientRequestId: 'advance-apply-01',
    });

    expect(result).toMatchObject({
      replayed: false,
      applied: 100,
      advanceBalance: 200,
      outstanding: 400,
      allocations: [{ purchaseId: 'purchase-1', invoiceId: null, amount: 100 }],
    });
    expect(po.paidAmount).toBe(100);
    expect(supplierBalance).toBe(400);
    expect(advanceBalance).toBe(200);
    expect(tx.supplierAdvanceEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        supplierId: 'supplier-1',
        type: 'APPLIED',
        amount: -100,
        balanceAfter: 200,
        purchaseId: 'purchase-1',
        clientRequestId: 'advance-apply-01',
      }),
    }));
    expect(tx.supplierLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        referenceType: 'SupplierAdvance',
        amount: -100,
        balanceAfter: 400,
      }),
    }));
    expect(tx.supplierPayment.create).not.toHaveBeenCalled();
    expect(tx.cashBookEntry.create).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledWith('accounting.supplier-advance.applied', expect.objectContaining({
      tenantId: 'tenant-1',
      userId: 'user-1',
    }));
    expect(emittedAfterCommit).toBe(true);
  });
});
