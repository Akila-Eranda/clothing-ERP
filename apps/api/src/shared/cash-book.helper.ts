import { PaymentMethod, Prisma } from '@prisma/client';

/**
 * Single place that appends to the cash book (the running physical-cash ledger).
 *
 * Why: three writers (customer payments, supplier payments, manual entries) each read the last row, computed
 * `balanceAfter = prev ± amount` and inserted - with no lock, so two concurrent writers read the same `prev` and
 * stored the same / wrong running balance. Here the whole read-modify-write runs under a per-tenant transaction
 * advisory lock, so entries are strictly serialised and `balanceAfter` always equals the previous balance plus
 * debit minus credit.
 *
 * The cash book is for PHYSICAL CASH only. Card / QR / bank / cheque movements belong to their own clearing / bank
 * accounts and must not be passed here (see `isPhysicalCashMethod`).
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Only CASH is a physical cash movement. Everything else settles through a bank / clearing account. */
export function isPhysicalCashMethod(method: PaymentMethod | string | null | undefined): boolean {
  return String(method ?? '').toUpperCase() === 'CASH';
}

export type CashBookEntryInput = {
  tenantId: string;
  branchId?: string | null;
  entryDate?: Date;
  type: string;
  description: string;
  /** money in */
  debit?: number;
  /** money out */
  credit?: number;
  paymentMethod?: PaymentMethod | null;
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
};

/** Must be called with a transaction client so the lock lives exactly as long as the insert. */
export async function appendCashBookEntryTx(tx: Prisma.TransactionClient, input: CashBookEntryInput) {
  const debit = round2(input.debit ?? 0);
  const credit = round2(input.credit ?? 0);
  if (debit < 0 || credit < 0) throw new Error('Cash book amounts cannot be negative');
  if (debit > 0 && credit > 0) throw new Error('A cash book entry is either money in or money out');

  // One lock per tenant covers both "this branch" and "whole shop" running balances.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cashbook:${input.tenantId}`}, 0))`;

  const last = await tx.cashBookEntry.findFirst({
    where: { tenantId: input.tenantId, ...(input.branchId ? { branchId: input.branchId } : {}) },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { balanceAfter: true },
  });
  const prev = last?.balanceAfter ?? 0;
  return tx.cashBookEntry.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId || undefined,
      entryDate: input.entryDate ?? new Date(),
      type: input.type,
      description: input.description,
      debit,
      credit,
      balanceAfter: round2(prev + debit - credit),
      paymentMethod: input.paymentMethod ?? undefined,
      referenceType: input.referenceType ?? undefined,
      referenceId: input.referenceId ?? undefined,
      createdBy: input.createdBy ?? undefined,
    },
  });
}
