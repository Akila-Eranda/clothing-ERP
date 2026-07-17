/** Pure customer-credit workflow helpers — unit-tested. */

import { BadRequestException } from '@nestjs/common';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function creditAvailable(creditLimit: number, creditBalance: number): number {
  if (creditLimit <= 0) return 0;
  return Math.max(0, round2(creditLimit - creditBalance));
}

/** Split a received amount into AR settlement + prepaid advance (wallet). */
export function splitCreditPayment(amount: number, creditBalance: number): { applied: number; advance: number } {
  const outstanding = Math.max(0, round2(creditBalance));
  const applied = round2(Math.min(Math.max(0, amount), outstanding));
  const advance = round2(Math.max(0, amount - applied));
  return { applied, advance };
}

export function assertCreditAvailable(
  creditLimit: number,
  creditBalance: number,
  chargeAmount: number,
): void {
  if (chargeAmount <= 0) return;
  if (creditLimit <= 0) {
    throw new BadRequestException('Customer has no credit limit — set a limit in customer profile first');
  }
  const available = creditAvailable(creditLimit, creditBalance);
  if (chargeAmount > available + 0.01) {
    throw new BadRequestException(`Credit limit exceeded. Available: LKR ${available.toFixed(2)}`);
  }
}

export function computeChargeDueDate(chargeDate: Date, creditDays: number): Date {
  const days = Math.max(0, Math.floor(creditDays || 0));
  const d = new Date(Date.UTC(
    chargeDate.getUTCFullYear(),
    chargeDate.getUTCMonth(),
    chargeDate.getUTCDate(),
  ));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export type InstallmentLine = {
  sequence: number;
  dueDate: Date;
  amount: number;
};

/** Equal installments; remainder cents on last line. */
export function generateInstallmentSchedule(
  totalAmount: number,
  installmentCount: number,
  startDate: Date,
  intervalDays = 30,
): InstallmentLine[] {
  const count = Math.max(1, Math.floor(installmentCount));
  const total = round2(totalAmount);
  if (total <= 0) return [];
  const base = round2(Math.floor((total / count) * 100) / 100);
  const lines: InstallmentLine[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const due = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ));
    due.setUTCDate(due.getUTCDate() + i * intervalDays);
    const amount = i === count - 1 ? round2(total - allocated) : base;
    allocated = round2(allocated + amount);
    lines.push({ sequence: i + 1, dueDate: due, amount });
  }
  return lines;
}

export type OpenCharge = { id: string; amount: number; paidAmount: number; dueDate: Date };

export type PaymentAllocation = { chargeId: string; applied: number; remainingOnCharge: number };

/** FIFO allocation of a payment across open charges (oldest due first). */
export function allocatePaymentFifo(charges: OpenCharge[], paymentAmount: number): PaymentAllocation[] {
  const pay = round2(paymentAmount);
  if (pay <= 0) return [];
  const sorted = [...charges]
    .map((c) => ({ ...c, open: round2(c.amount - c.paidAmount) }))
    .filter((c) => c.open > 0.009)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  let left = pay;
  const out: PaymentAllocation[] = [];
  for (const c of sorted) {
    if (left <= 0.009) break;
    const applied = round2(Math.min(c.open, left));
    left = round2(left - applied);
    out.push({
      chargeId: c.id,
      applied,
      remainingOnCharge: round2(c.open - applied),
    });
  }
  return out;
}

export function collectionRecoveryRate(outstandingStart: number, collected: number): number {
  if (outstandingStart <= 0) return collected > 0 ? 100 : 0;
  return round2(Math.min(100, (collected / outstandingStart) * 100));
}

export function daysPastDue(dueDate: Date, asOf: Date): number {
  const a = new Date(asOf); a.setHours(0, 0, 0, 0);
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  return Math.floor((a.getTime() - d.getTime()) / 86400000);
}

export function chargeStatus(amount: number, paidAmount: number): 'OPEN' | 'PARTIAL' | 'PAID' {
  const paid = round2(paidAmount);
  const amt = round2(amount);
  if (paid <= 0.009) return 'OPEN';
  if (paid + 0.009 >= amt) return 'PAID';
  return 'PARTIAL';
}

/** Signed effect of a credit txn on customer outstanding (CHARGE +, PAYMENT/CN −). */
export function creditTxnSignedDelta(type: string, amount: number): number {
  const amt = round2(Math.abs(amount));
  if (type === 'CHARGE') return amt;
  if (type === 'PAYMENT' || type === 'CREDIT_NOTE' || type === 'ADJUSTMENT_DOWN') return -amt;
  if (type === 'ADJUSTMENT_UP') return amt;
  return 0;
}

export type LedgerTxnInput = {
  id: string;
  type: string;
  amount: number;
  createdAt: Date;
  description?: string | null;
  referenceId?: string | null;
  status?: string;
  dueDate?: Date | null;
  paidAmount?: number;
};

/** Chronological ledger with running outstanding balance. */
export function buildCustomerLedger(
  txns: LedgerTxnInput[],
  range?: { from?: Date; to?: Date },
): {
  opening: number;
  closing: number;
  entries: (LedgerTxnInput & { debit: number; credit: number; balanceAfter: number })[];
} {
  const sorted = [...txns].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let bal = 0;
  let opening = 0;
  let openingCaptured = !range?.from;
  const entries: (LedgerTxnInput & { debit: number; credit: number; balanceAfter: number })[] = [];

  for (const t of sorted) {
    if (range?.to && t.createdAt.getTime() > range.to.getTime()) break;

    if (range?.from && !openingCaptured && t.createdAt.getTime() >= range.from.getTime()) {
      opening = bal;
      openingCaptured = true;
    }

    const delta = creditTxnSignedDelta(t.type, t.amount);
    bal = round2(bal + delta);

    const inRange =
      (!range?.from || t.createdAt.getTime() >= range.from.getTime()) &&
      (!range?.to || t.createdAt.getTime() <= range.to.getTime());

    if (inRange) {
      entries.push({
        ...t,
        debit: delta > 0 ? Math.abs(delta) : 0,
        credit: delta < 0 ? Math.abs(delta) : 0,
        balanceAfter: bal,
      });
    }
  }

  if (!openingCaptured) {
    // All activity was before `from`, or no activity — opening = current reconstructed bal
    opening = range?.from ? bal : 0;
  }
  if (!range?.from) opening = 0;

  return { opening: round2(opening), closing: round2(bal), entries };
}

