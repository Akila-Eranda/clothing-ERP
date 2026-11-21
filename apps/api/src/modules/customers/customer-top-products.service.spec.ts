import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomerCreditService } from './customer-credit.service';
import { CustomersService } from './customers.module';

describe('CustomersService top products', () => {
  it('aggregates customer sale lines by variant and ranks by purchased quantity', async () => {
    const customer = {
      id: 'customer-1',
      tenantId: 'tenant-1',
      creditLimit: 500,
      creditBalance: 100,
      sales: [
        {
          id: 'sale-1',
          invoiceNumber: 'INV-1',
          invoiceDate: new Date('2026-11-01T10:00:00.000Z'),
          total: 100,
          amountPaid: 100,
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          payments: [],
          _count: { items: 2 },
          items: [
            { productName: 'Tea', variantName: '500 g', quantity: 2, total: 40, variantId: 'variant-tea' },
            { productName: 'Rice', variantName: '1 kg', quantity: 1, total: 60, variantId: 'variant-rice' },
          ],
        },
        {
          id: 'sale-2',
          invoiceNumber: 'INV-2',
          invoiceDate: new Date('2026-11-10T10:00:00.000Z'),
          total: 60,
          amountPaid: 60,
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          payments: [],
          _count: { items: 2 },
          items: [
            { productName: 'Tea', variantName: '500 g', quantity: 3, total: 45, variantId: 'variant-tea' },
            { productName: 'Custom item', variantName: '', quantity: 0.5, total: 15, variantId: null },
          ],
        },
      ],
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(customer),
      },
    };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as CustomerCreditService,
      {} as EventEmitter2,
    );

    const result = await service.findOne('customer-1', 'tenant-1');

    expect(result.topProducts).toEqual([
      { productName: 'Tea', qty: 5, spent: 85, variantId: 'variant-tea' },
      { productName: 'Rice', qty: 1, spent: 60, variantId: 'variant-rice' },
      { productName: 'Custom item', qty: 0.5, spent: 15, variantId: '' },
    ]);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1', tenantId: 'tenant-1' },
      include: expect.objectContaining({
        sales: expect.objectContaining({ where: { isReturn: false } }),
      }),
    }));
  });
});
