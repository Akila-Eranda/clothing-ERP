import { INestApplication } from '@nestjs/common';
import { AccountingOutboxStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AccountingAutomationListener } from '../../src/modules/accounting/accounting-automation.listener';

export async function waitForAccountingOutbox(
  app: INestApplication,
  prisma: PrismaService,
  tenantIds: string[],
  timeoutMs = 30_000,
): Promise<void> {
  if (tenantIds.length === 0) return;
  const listener = app.get(AccountingAutomationListener);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Timed out waiting for accounting outbox tenants: ${tenantIds.join(', ')}`);
    }
    await listener.waitForIdle(remainingMs);

    const events = await prisma.accountingOutboxEvent.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true, tenantId: true, sourceType: true, sourceId: true, status: true, lastError: true },
    });
    const failed = events.filter((event) => event.status === AccountingOutboxStatus.FAILED);
    if (failed.length > 0) {
      throw new Error(
        `Accounting outbox has failed work: ${failed
          .map((event) => `${event.tenantId}/${event.sourceType}/${event.sourceId}: ${event.lastError ?? 'unknown error'}`)
          .join('; ')}`,
      );
    }

    const active = events.filter(
      (event) =>
        event.status === AccountingOutboxStatus.PENDING ||
        event.status === AccountingOutboxStatus.PROCESSING,
    );
    if (active.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for accounting outbox work: ${active
          .map((event) => `${event.tenantId}/${event.sourceType}/${event.sourceId} (${event.status})`)
          .join(', ')}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  }
}
