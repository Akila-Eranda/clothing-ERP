import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CustomerCreditService } from './customer-credit.service';
import { CreateCustomerDto, CustomersService } from './customers.module';

describe('customer WhatsApp payment notification consent', () => {
  const createService = () => {
    const prisma = {
      customer: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new CustomersService(
      prisma,
      {} as CustomerCreditService,
      {} as EventEmitter2,
    );
    return { prisma, service };
  };

  it('stores explicit consent when creating a customer', async () => {
    const { prisma, service } = createService();
    prisma.customer.findFirst = jest.fn().mockResolvedValue(null);
    prisma.customer.create = jest.fn().mockResolvedValue({ id: 'customer-1' });

    await service.create(
      'tenant-1',
      { firstName: 'Nimal', phone: '0771234567', whatsappConsent: true } as CreateCustomerDto,
    );

    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          metadata: { whatsappConsent: true },
        }),
      }),
    );
  });

  it('revokes consent on update without discarding other metadata', async () => {
    const { prisma, service } = createService();
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'customer-1',
      creditLimit: 0,
      creditBalance: 0,
      metadata: { loyaltySegment: 'regular', whatsapp: { consent: true, source: 'customer-form' } },
    } as never);
    prisma.customer.update = jest.fn().mockResolvedValue({ id: 'customer-1' });

    await service.update('customer-1', 'tenant-1', { whatsappConsent: false });

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: {
          metadata: {
            loyaltySegment: 'regular',
            whatsappConsent: false,
            whatsapp: { consent: false, source: 'customer-form' },
          },
        },
      }),
    );
  });
});
