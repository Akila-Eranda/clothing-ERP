import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { CustomerCreditService } from './customer-credit.service';

describe('CustomerCreditService return reversal', () => {
  it('reverses no more than both the open sale charge and current customer credit', async () => {
    const charge = {
      id: 'charge-1',
      customerId: 'customer-1',
      tenantId: 'tenant-1',
      amount: 600,
      paidAmount: 500,
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: charge.id }])
        .mockResolvedValueOnce([]),
      customerCreditTransaction: {
        findUnique: jest.fn().mockResolvedValue(charge),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'credit-note-1' }),
      },
      customer: {
        findFirst: jest.fn().mockResolvedValue({ creditBalance: 50 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new CustomerCreditService(
      {} as PrismaService,
      {} as EventEmitter2,
      {} as NotificationsService,
    );

    const result = await service.reverseCreditForSaleReturn(
      'tenant-1',
      'sale-1',
      100,
      'Return RET-1 credit reversal',
      tx as unknown as Prisma.TransactionClient,
    );

    expect(result).toEqual({ reversed: 50, customerId: 'customer-1' });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { creditBalance: { decrement: 50 } },
    });
    expect(tx.customerCreditTransaction.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: { paidAmount: 550, status: 'PARTIAL' },
    });
    expect(tx.customerCreditTransaction.create).toHaveBeenCalledWith({
      data: {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        amount: 50,
        type: 'CREDIT_NOTE',
        status: 'PAID',
        paidAmount: 50,
        description: 'Return RET-1 credit reversal',
        referenceId: 'sale-1',
      },
    });
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1', tenantId: 'tenant-1' },
      select: { creditBalance: true },
    });
  });
});
