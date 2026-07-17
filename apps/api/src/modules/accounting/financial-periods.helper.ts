/** Phase 01 Sprint 2 — Financial periods helpers (pure). */

import { BadRequestException } from '@nestjs/common';

export type PeriodDraft = {
  sequence: number;
  name: string;
  startDate: Date;
  endDate: Date;
};

/** Build 12 monthly periods covering [startDate, endDate]. */
export function generateMonthlyPeriods(startDate: Date, endDate: Date): PeriodDraft[] {
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  if (end < start) throw new BadRequestException('Fiscal year end date must be after start date');

  const periods: PeriodDraft[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let seq = 1;

  while (cursor <= end && seq <= 24) {
    const periodStart = seq === 1 ? start : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const periodEnd = monthEnd > end ? end : monthEnd;
    if (periodStart > end) break;

    const name = periodStart.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    periods.push({
      sequence: seq,
      name,
      startDate: periodStart,
      endDate: periodEnd,
    });

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    seq += 1;
  }

  if (!periods.length) throw new BadRequestException('Could not generate accounting periods');
  return periods;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function assertCanClosePeriod(params: {
  periodStatus: string;
  fiscalYearStatus: string;
}): void {
  if (params.fiscalYearStatus === 'CLOSED') {
    throw new BadRequestException('Cannot change periods on a closed fiscal year');
  }
  if (params.periodStatus === 'CLOSED' || params.periodStatus === 'LOCKED') {
    throw new BadRequestException('Period is already closed');
  }
}

export function assertCanReopenPeriod(params: {
  periodStatus: string;
  fiscalYearStatus: string;
}): void {
  if (params.fiscalYearStatus === 'CLOSED') {
    throw new BadRequestException('Cannot reopen periods on a closed fiscal year');
  }
  if (params.periodStatus === 'OPEN') {
    throw new BadRequestException('Period is already open');
  }
  if (params.periodStatus === 'LOCKED') {
    throw new BadRequestException('Locked periods cannot be reopened — unlock via year-end reverse (not allowed)');
  }
}

export type YearEndCloseCheck = {
  ok: boolean;
  reasons: string[];
  openPeriodNames: string[];
};

export function evaluateYearEndCloseRules(params: {
  fiscalYearStatus: string;
  periods: { name: string; status: string }[];
  hasRetainedEarningsAccount: boolean;
}): YearEndCloseCheck {
  const reasons: string[] = [];
  if (params.fiscalYearStatus === 'CLOSED') {
    reasons.push('Fiscal year is already closed');
  }
  const open = params.periods.filter((p) => p.status === 'OPEN');
  if (open.length) {
    reasons.push(`Close all periods first (${open.length} still open)`);
  }
  if (!params.hasRetainedEarningsAccount) {
    reasons.push('Retained Earnings equity account is required (code 3100 or type EQUITY)');
  }
  return {
    ok: reasons.length === 0,
    reasons,
    openPeriodNames: open.map((p) => p.name),
  };
}

/** Net income = revenue − expense (simple P&L for closing). */
export function computeNetIncomeForClose(revenueTotal: number, expenseTotal: number): number {
  return Math.round((revenueTotal - expenseTotal + Number.EPSILON) * 100) / 100;
}
