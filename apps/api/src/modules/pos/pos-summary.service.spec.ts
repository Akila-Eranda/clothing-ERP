import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PosService } from './pos.module';

describe('PosService daily summary', () => {
  function createService() {
    const sales = [
      {
        cashRegisterId: 'register-1',
        total: 100,
        changeDue: 10,
        changeSavedToWallet: 0,
        payments: [{ method: PaymentMethod.CASH, amount: 100 }],
      },
      {
        cashRegisterId: 'register-1',
        total: 200,
        changeDue: 0,
        changeSavedToWallet: 0,
        payments: [{ method: PaymentMethod.CARD, amount: 200 }],
      },
    ];
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Colombo' }) },
      cashRegister: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{
          id: 'register-1',
          counter: { id: 'counter-1', name: 'Front', code: 'F1' },
        }]),
      },
      sale: {
        findMany: jest.fn().mockResolvedValue(sales),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { total: 300, taxAmount: 30, discountAmount: 5 },
          _count: { id: 2 },
        }),
      },
      saleItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 4.5 } }) },
      expense: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 20, paymentMethod: PaymentMethod.CASH },
          { amount: 10, paymentMethod: PaymentMethod.CARD },
        ]),
      },
      supplierPayment: {
        findMany: jest.fn().mockResolvedValue([
          { amount: 40, method: PaymentMethod.CASH },
          { amount: 60, method: PaymentMethod.BANK_TRANSFER },
        ]),
      },
    };
    const service = new PosService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('uses the shop-local day and aggregates sales, items, counter and cash totals', async () => {
    const { service, prisma } = createService();

    const summary = await service.getDailySummary('tenant-1', 'branch-1', '2026-11-15');

    const from = new Date('2026-11-14T18:30:00.000Z');
    const to = new Date('2026-11-15T18:29:59.999Z');
    expect(summary).toMatchObject({
      date: '2026-11-15',
      totalSales: 2,
      totalRevenue: 300,
      totalTax: 30,
      totalDiscount: 5,
      totalItems: 4.5,
      byCounter: [{ name: 'Front', code: 'F1', orders: 2, amount: 300 }],
      byPaymentMethod: { CASH: 100, CARD: 200 },
      expenses: 30,
      cashExpenses: 20,
      supplierPayments: 100,
      cashSupplierPayments: 40,
      netIncome: 270,
      cash: {
        openingFloat: 0,
        cashSalesNet: 90,
        cashExpenses: 20,
        cashSupplierPayments: 40,
        cashOut: 60,
        refunds: 0,
        expectedInDrawer: 30,
      },
    });
    expect(prisma.sale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        invoiceDate: { gte: from, lte: to },
      }),
    }));
    expect(prisma.saleItem.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sale: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          invoiceDate: { gte: from, lte: to },
        }),
      }),
    }));
  });

  it('rejects an impossible requested shop date with a clear client error', async () => {
    const { service, prisma } = createService();

    await expect(service.getDailySummary('tenant-1', 'branch-1', '2026-13-45'))
      .rejects.toThrow(new BadRequestException('Invalid date (use YYYY-MM-DD)'));
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });
});
