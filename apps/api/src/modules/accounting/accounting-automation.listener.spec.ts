import { Logger } from '@nestjs/common';
import { AccountingAutomationListener } from './accounting-automation.listener';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { AccountingOutboxService } from './accounting-outbox.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AccountingAutomationListener', () => {
  it('waits for in-flight outbox handlers to complete', async () => {
    const pending = deferred<void>();
    const outbox = { enqueue: jest.fn(() => pending.promise) } as unknown as AccountingOutboxService;
    const listener = new AccountingAutomationListener(
      {} as AccountingBootstrapService,
      outbox,
    );
    listener.onGrnPosted({ grnId: 'grn-1', tenantId: 'tenant-1' });

    let drained = false;
    const drain = listener.waitForIdle(500).then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(outbox.enqueue).toHaveBeenCalledWith('tenant-1', 'GRN', 'grn-1', {
      userId: undefined,
    });
    expect(drained).toBe(false);

    pending.resolve();
    await drain;
    expect(drained).toBe(true);
  });

  it('reports the unfinished event when the bounded drain times out', async () => {
    const pending = deferred<void>();
    const outbox = { enqueue: jest.fn(() => pending.promise) } as unknown as AccountingOutboxService;
    const listener = new AccountingAutomationListener(
      {} as AccountingBootstrapService,
      outbox,
    );
    listener.onGrnPosted({ grnId: 'grn-slow', tenantId: 'tenant-1' });

    await expect(listener.waitForIdle(10)).rejects.toThrow(
      /Timed out after 10ms waiting for accounting work: GRN:grn-slow/,
    );

    pending.resolve();
    await listener.waitForIdle();
  });

  it('finishes handler logging before the drain resolves', async () => {
    const pending = deferred<void>();
    const outbox = { enqueue: jest.fn(() => pending.promise) } as unknown as AccountingOutboxService;
    const listener = new AccountingAutomationListener(
      {} as AccountingBootstrapService,
      outbox,
    );
    let logged = false;
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      logged = true;
    });

    try {
      listener.onGrnPosted({ grnId: 'grn-error', tenantId: 'tenant-1' });
      const drain = listener.waitForIdle(500);
      await Promise.resolve();
      pending.reject(new Error('posting failed'));
      await drain;
      expect(logged).toBe(true);
    } finally {
      logger.mockRestore();
    }
  });
});
