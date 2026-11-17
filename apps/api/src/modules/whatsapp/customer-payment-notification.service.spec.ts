import { CustomerPaymentNotificationService } from './customer-payment-notification.service';
import { WhatsappService } from './whatsapp.service';

describe('CustomerPaymentNotificationService', () => {
  const event = {
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    paymentTxnId: 'payment-transaction-1',
    amount: 1500,
    applied: 1200,
    advance: 300,
    method: 'CARD',
  };
  const payment = {
    id: event.paymentTxnId,
    amount: 1500,
    paidAmount: 1200,
    description: 'Payment via CARD',
    createdAt: new Date('2026-11-15T00:00:00Z'),
    customer: {
      firstName: 'Nimal',
      lastName: 'Perera',
      phone: '0771234567',
      metadata: { whatsappConsent: true },
      creditBalance: 800,
    },
  };

  function createHarness(options: {
    existingStatus?: 'sent' | 'skipped' | 'processing' | 'failed';
    consent?: boolean;
    sendError?: Error;
    retryRows?: { tenantId: string; data: unknown }[];
  } = {}) {
    let notificationData: Record<string, unknown> | null = options.existingStatus
      ? {
          kind: 'customer_payment_received',
          paymentTxnId: event.paymentTxnId,
          status: options.existingStatus,
          startedAt: Date.now(),
        }
      : null;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      notification: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(
          options.existingStatus ? { id: 'notification-1', data: notificationData } : null,
        )),
        create: jest.fn().mockImplementation(({ data }) => {
          notificationData = data.data;
          return Promise.resolve({ id: 'notification-1' });
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          notificationData = data.data;
          return Promise.resolve({ id: 'notification-1' });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      customerCreditTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          ...payment,
          customer: {
            ...payment.customer,
            metadata: { whatsappConsent: options.consent ?? true },
          },
        }),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue(options.retryRows ?? []),
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(
          notificationData ? { id: 'notification-1', data: notificationData } : null,
        )),
        update: jest.fn().mockImplementation(({ data }) => {
          notificationData = data.data;
          return Promise.resolve({ id: 'notification-1' });
        }),
      },
    };
    const whatsapp = {
      sendText: jest.fn().mockImplementation(() =>
        options.sendError ? Promise.reject(options.sendError) : Promise.resolve({ success: true }),
      ),
    };
    const service = new CustomerPaymentNotificationService(
      prisma as never,
      whatsapp as unknown as WhatsappService,
    );
    return { service, prisma, tx, whatsapp };
  }

  it('sends one consented payment receipt with the customer and allocation details', async () => {
    const { service, whatsapp, prisma } = createHarness();

    await service.handlePaymentCommitted(event);

    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      'tenant-1',
      'system',
      expect.objectContaining({
        phone: '94771234567',
        message: expect.stringContaining('Amount received: LKR 1500.00'),
      }),
      { recordNotification: false },
    );
    const message = whatsapp.sendText.mock.calls[0][2].message;
    expect(message).toContain('Applied to outstanding credit: LKR 1200.00');
    expect(message).toContain('Advance added to wallet: LKR 300.00');
    expect(message).toContain('Remaining credit balance: LKR 800.00');
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    }));
  });

  it('does not send when consent is absent and records the notification as skipped', async () => {
    const { service, whatsapp, prisma } = createHarness({ consent: false });

    await service.handlePaymentCommitted(event);

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped' }),
      }),
    }));
  });

  it('does not send a duplicate for a payment already marked sent', async () => {
    const { service, whatsapp, prisma } = createHarness({ existingStatus: 'sent' });

    await service.handlePaymentCommitted(event);

    expect(whatsapp.sendText).not.toHaveBeenCalled();
    expect(prisma.customerCreditTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('marks a provider failure retryable without leaking it to the payment flow', async () => {
    const { service, whatsapp, prisma } = createHarness({ sendError: new Error('provider unavailable') });
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

    await expect(service.handlePaymentCommitted(event)).resolves.toBeUndefined();

    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          error: 'provider unavailable',
        }),
      }),
    }));
  });

  it('retries failed payment notifications and filters unrelated WhatsApp traffic before the batch limit', async () => {
    const retryData = {
      kind: 'customer_payment_received',
      paymentTxnId: event.paymentTxnId,
      status: 'failed',
      attempts: 1,
    };
    const { service, prisma, whatsapp } = createHarness({
      existingStatus: 'failed',
      retryRows: [{ tenantId: event.tenantId, data: retryData }],
    });

    await service.retryFailedPayments();

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { data: { path: ['kind'], equals: 'customer_payment_received' } },
          {
            OR: expect.arrayContaining([
              { data: { path: ['status'], equals: 'failed' } },
              { data: { path: ['status'], equals: 'processing' } },
            ]),
          },
        ]),
      }),
      take: 200,
    }));
    expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
  });
});
