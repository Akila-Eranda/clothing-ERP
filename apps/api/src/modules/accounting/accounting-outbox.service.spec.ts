import { AccountingOutboxStatus } from '@prisma/client';
import { AccountingOutboxService } from './accounting-outbox.service';

describe('AccountingOutboxService worker claim', () => {
  it('dispatches an event only once when two workers race', async () => {
    const event = {
      id: 'event-1',
      tenantId: 'tenant-1',
      sourceType: 'SALE',
      sourceId: 'sale-1',
      payload: {},
      status: AccountingOutboxStatus.PENDING,
    };
    let status: AccountingOutboxStatus = event.status;
    let attempts = 0;
    const prisma = {
      accountingOutboxEvent: {
        findFirst: jest.fn(async () => ({ ...event, status })),
        findFirstOrThrow: jest.fn(async () => ({ ...event, status })),
        updateMany: jest.fn(async () => {
          if (status !== AccountingOutboxStatus.PENDING && status !== AccountingOutboxStatus.FAILED) {
            return { count: 0 };
          }
          status = AccountingOutboxStatus.PROCESSING;
          attempts++;
          return { count: 1 };
        }),
        update: jest.fn(async (_args: { data: { status: AccountingOutboxStatus } }) => {
          status = _args.data.status;
          return { ...event, status };
        }),
      },
    } as any;
    const posting = {};
    const service = new AccountingOutboxService(prisma, posting as any);
    const dispatch = jest.fn(async () => ({ journalId: 'journal-1' }));
    (service as any).dispatch = dispatch;

    await Promise.all([
      service.processOne(event.id, event.tenantId),
      service.processOne(event.id, event.tenantId),
    ]);

    expect(attempts).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(status).toBe(AccountingOutboxStatus.POSTED);
  });
});
