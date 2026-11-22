import { AccountingOutboxStatus, Prisma } from '@prisma/client';

/**
 * Transactional outbox: write the "post this to the general ledger" intent in the SAME database transaction as the
 * business record (sale, customer payment ...). If the transaction rolls back the intent disappears with it; if it
 * commits the intent is guaranteed to exist, so the payment and its accounting can never silently drift apart even
 * if the process dies right after commit. The existing after-commit event (fast path) and the sweeper
 * (AccountingOutboxService.sweep) turn the PENDING row into a journal; processing is idempotent and claimed atomically.
 *
 * Pure Prisma (no Nest DI) so any module can call it without importing the accounting module.
 */
export async function enqueueOutboxInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sourceType: string,
  sourceId: string,
  payload: Record<string, unknown> = {},
) {
  return tx.accountingOutboxEvent.upsert({
    where: { tenantId_sourceType_sourceId: { tenantId, sourceType, sourceId } },
    create: {
      tenantId,
      sourceType,
      sourceId,
      payload: payload as Prisma.InputJsonValue,
      status: AccountingOutboxStatus.PENDING,
    },
    // already queued / posted: never reset or duplicate it
    update: {},
  });
}
