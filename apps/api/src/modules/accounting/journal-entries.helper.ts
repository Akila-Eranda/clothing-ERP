/** Phase 02 Sprint 3 — Journal entry helpers (pure). */

import { BadRequestException } from '@nestjs/common';
import { JournalEntryType } from '@prisma/client';

export type GlJournalLineInput = {
  accountId: string;
  side: 'DEBIT' | 'CREDIT';
  amount: number;
  description?: string;
};

/** Legacy paired debit/credit row from older API/UI. */
export type PairedJournalLineInput = {
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  description?: string;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function expandPairedLines(pairs: PairedJournalLineInput[]): GlJournalLineInput[] {
  const out: GlJournalLineInput[] = [];
  for (const p of pairs) {
    out.push({
      accountId: p.debitAccountId,
      side: 'DEBIT',
      amount: p.amount,
      description: p.description,
    });
    out.push({
      accountId: p.creditAccountId,
      side: 'CREDIT',
      amount: p.amount,
      description: p.description,
    });
  }
  return out;
}

export function normalizeJournalLines(dto: {
  lines?: PairedJournalLineInput[];
  glLines?: GlJournalLineInput[];
}): GlJournalLineInput[] {
  if (dto.glLines?.length) {
    return dto.glLines.map((l) => ({
      accountId: l.accountId,
      side: l.side,
      amount: Number(l.amount),
      description: l.description,
    }));
  }
  if (dto.lines?.length) return expandPairedLines(dto.lines);
  throw new BadRequestException('At least one journal line is required');
}

export function assertDebitEqualsCredit(lines: GlJournalLineInput[]): {
  debitTotal: number;
  creditTotal: number;
} {
  if (!lines.length) throw new BadRequestException('Journal must have lines');
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (!line.accountId) throw new BadRequestException('Each line needs an account');
    if (line.amount == null || Number.isNaN(line.amount) || line.amount <= 0) {
      throw new BadRequestException('Each line amount must be positive');
    }
    if (line.side !== 'DEBIT' && line.side !== 'CREDIT') {
      throw new BadRequestException('Line side must be DEBIT or CREDIT');
    }
    if (line.side === 'DEBIT') debitTotal = round2(debitTotal + line.amount);
    else creditTotal = round2(creditTotal + line.amount);
  }
  if (Math.abs(debitTotal - creditTotal) > 0.009) {
    throw new BadRequestException(
      `Debits (LKR ${debitTotal.toFixed(2)}) must equal credits (LKR ${creditTotal.toFixed(2)})`,
    );
  }
  if (debitTotal < 0.01) {
    throw new BadRequestException('Journal totals must be greater than zero');
  }
  return { debitTotal, creditTotal };
}

/** Sequential journal number: JE-2026-00001 */
export function formatJournalNumber(year: number, seq: number): string {
  return `JE-${year}-${String(seq).padStart(5, '0')}`;
}

export function parseJournalSeq(entryNumber: string, year: number): number | null {
  const m = new RegExp(`^JE-${year}-(\\d+)$`, 'i').exec(entryNumber);
  if (!m) return null;
  return parseInt(m[1], 10);
}

export function nextJournalSequence(existingNumbers: string[], year: number): number {
  let max = 0;
  for (const n of existingNumbers) {
    const seq = parseJournalSeq(n, year);
    if (seq != null && seq > max) max = seq;
  }
  return max + 1;
}

export function toPrismaLineCreates(lines: GlJournalLineInput[]) {
  return lines.map((l) => ({
    type: l.side === 'DEBIT' ? JournalEntryType.DEBIT : JournalEntryType.CREDIT,
    amount: round2(l.amount),
    description: l.description,
    ...(l.side === 'DEBIT'
      ? { debitAccountId: l.accountId }
      : { creditAccountId: l.accountId }),
  }));
}
