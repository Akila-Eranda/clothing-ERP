/**
 * Stock transfer status claim (S-F10) - pure helper, no database.
 *
 * The service moves a transfer with `updateMany({ where: { id, tenantId, status: <expected> } })` as the FIRST
 * write inside the stock transaction (same pattern as postSupplierReturn). PostgreSQL re-checks the WHERE after
 * waiting for a concurrent writer, so of two simultaneous dispatches (or receives) only one gets count = 1;
 * the other is refused here and its transaction rolls back before any stock moves.
 */
import { ConflictException } from '@nestjs/common';

export type TransferClaimAction = 'dispatch' | 'receive' | 'cancel';

const MESSAGES: Record<TransferClaimAction, string> = {
  dispatch: 'Transfer was already dispatched or changed by another request',
  receive: 'Transfer was already received or changed by another request',
  cancel: 'Transfer was already dispatched or changed by another request',
};

export function assertTransferClaimed(result: { count: number } | null | undefined, action: TransferClaimAction): void {
  if (!result || result.count !== 1) throw new ConflictException(MESSAGES[action]);
}
