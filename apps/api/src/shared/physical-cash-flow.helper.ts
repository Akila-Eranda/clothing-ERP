import { CashMovementType, CashRegisterStatus } from '@prisma/client';
import { computeExpectedCashFromMovements, summarizeMovements } from './cash-register.helper';
import { shopDateString } from './day-end-report.helper';

/**
 * PHYSICAL CASH FLOW (cash basis) - one definition, used for the report and its CSV export.
 *
 *   Expected closing = Opening + Cash inflows - Cash outflows        (per shift, per day, per branch, per cashier)
 *   Variance         = Counted cash - Expected closing               (closed shifts only)
 *
 * Source of truth is the drawer ledger (cash movements of each shift), so card / QR / bank / cheque / wallet
 * tenders are NEVER part of it. Internal transfers between drawers and the safe are shown on their own lines
 * (they move cash, they are not sales or expenses). A shift belongs to the shop-timezone calendar day it was OPENED
 * (shift-day reporting, the same unit the day-end report closes).
 *
 * This is additive: the legacy accounting "cash flow" report (`/accounting/cash-flow`, all tenders by invoice date)
 * keeps its meaning. This report is the cash-basis one.
 */

export type PhysicalCashShift = {
  id: string;
  branchId: string;
  branchName?: string | null;
  cashierId: string;
  cashierName: string;
  openingTime: Date;
  closingTime: Date | null;
  status: CashRegisterStatus | string;
  openingCash: number;
  actualCash: number | null;
  movements: { type: CashMovementType | string; amount: number; reference?: string | null }[];
};

export type CashFlowLines = {
  opening: number;
  /** inflows */
  cashSales: number;
  deposits: number;
  transfersIn: number;
  inflowTotal: number;
  /** outflows */
  expenses: number;
  refunds: number;
  withdrawals: number;
  transfersOut: number;
  outflowTotal: number;
  expectedClosing: number;
  counted: number | null;
  variance: number | null;
  shifts: number;
  openShifts: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const zero = (): CashFlowLines => ({
  opening: 0, cashSales: 0, deposits: 0, transfersIn: 0, inflowTotal: 0, expenses: 0, refunds: 0, withdrawals: 0,
  transfersOut: 0, outflowTotal: 0, expectedClosing: 0, counted: null, variance: null, shifts: 0, openShifts: 0,
});

export function shiftCashFlow(shift: PhysicalCashShift): CashFlowLines {
  const movements = shift.movements.map((m) => ({ ...m, type: m.type as CashMovementType }));
  const s = summarizeMovements(movements);
  const expected = computeExpectedCashFromMovements(shift.openingCash, movements);
  const inflowTotal = r2(s.cashSales + s.deposits + s.transfersIn);
  const outflowTotal = r2(s.expenses + s.cashRefunds + s.withdrawals + s.transfersOut);
  const closed = shift.status === CashRegisterStatus.CLOSED || shift.status === CashRegisterStatus.PENDING_APPROVAL;
  const counted = closed && shift.actualCash != null ? r2(shift.actualCash) : null;
  return {
    opening: r2(shift.openingCash),
    cashSales: s.cashSales,
    deposits: s.deposits,
    transfersIn: s.transfersIn,
    inflowTotal,
    expenses: s.expenses,
    refunds: s.cashRefunds,
    withdrawals: s.withdrawals,
    transfersOut: s.transfersOut,
    outflowTotal,
    expectedClosing: expected,
    counted,
    variance: counted == null ? null : r2(counted - expected),
    shifts: 1,
    openShifts: closed ? 0 : 1,
  };
}

export function addFlow(a: CashFlowLines, b: CashFlowLines): CashFlowLines {
  const sum = (x: number, y: number) => r2(x + y);
  const counted = a.counted == null && b.counted == null ? null : r2((a.counted ?? 0) + (b.counted ?? 0));
  return {
    opening: sum(a.opening, b.opening),
    cashSales: sum(a.cashSales, b.cashSales),
    deposits: sum(a.deposits, b.deposits),
    transfersIn: sum(a.transfersIn, b.transfersIn),
    inflowTotal: sum(a.inflowTotal, b.inflowTotal),
    expenses: sum(a.expenses, b.expenses),
    refunds: sum(a.refunds, b.refunds),
    withdrawals: sum(a.withdrawals, b.withdrawals),
    transfersOut: sum(a.transfersOut, b.transfersOut),
    outflowTotal: sum(a.outflowTotal, b.outflowTotal),
    expectedClosing: sum(a.expectedClosing, b.expectedClosing),
    counted,
    variance: a.variance == null && b.variance == null ? null : r2((a.variance ?? 0) + (b.variance ?? 0)),
    shifts: a.shifts + b.shifts,
    openShifts: a.openShifts + b.openShifts,
  };
}

export type PhysicalCashFlowReport = {
  timezone: string;
  days: ({ date: string } & CashFlowLines)[];
  byBranch: ({ branchId: string; branchName: string | null } & CashFlowLines)[];
  byCashier: ({ cashierId: string; cashierName: string } & CashFlowLines)[];
  totals: CashFlowLines;
  /** true when every shift satisfies expected = opening + inflows - outflows (a self-check of the ledger maths) */
  reconciles: boolean;
};

export function buildPhysicalCashFlow(shifts: PhysicalCashShift[], timezone: string | null | undefined): PhysicalCashFlowReport {
  const tz = timezone || 'Asia/Colombo';
  const days = new Map<string, CashFlowLines>();
  const branches = new Map<string, { name: string | null; flow: CashFlowLines }>();
  const cashiers = new Map<string, { name: string; flow: CashFlowLines }>();
  let totals = zero();
  let reconciles = true;

  for (const shift of shifts) {
    const f = shiftCashFlow(shift);
    if (r2(f.opening + f.inflowTotal - f.outflowTotal) !== f.expectedClosing) reconciles = false;
    const day = shopDateString(shift.openingTime, tz);
    days.set(day, addFlow(days.get(day) ?? zero(), f));
    const b = branches.get(shift.branchId);
    branches.set(shift.branchId, { name: shift.branchName ?? null, flow: addFlow(b?.flow ?? zero(), f) });
    const c = cashiers.get(shift.cashierId);
    cashiers.set(shift.cashierId, { name: shift.cashierName, flow: addFlow(c?.flow ?? zero(), f) });
    totals = addFlow(totals, f);
  }

  return {
    timezone: tz,
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, f]) => ({ date, ...f })),
    byBranch: [...branches.entries()].map(([branchId, v]) => ({ branchId, branchName: v.name, ...v.flow })),
    byCashier: [...cashiers.entries()].map(([cashierId, v]) => ({ cashierId, cashierName: v.name, ...v.flow })),
    totals,
    reconciles,
  };
}

const CSV_COLUMNS: (keyof CashFlowLines)[] = [
  'opening', 'cashSales', 'deposits', 'transfersIn', 'inflowTotal', 'expenses', 'refunds', 'withdrawals', 'transfersOut',
  'outflowTotal', 'expectedClosing', 'counted', 'variance', 'shifts', 'openShifts',
];

/** Spreadsheet-safe CSV (text cells beginning with = + - @ are neutralised; numbers stay numbers). */
export function physicalCashFlowToCsv(report: PhysicalCashFlowReport): string {
  const cell = (v: unknown) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    const t = String(v);
    const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows: string[] = [];
  rows.push(['scope', 'key', 'name', ...CSV_COLUMNS].join(','));
  for (const d of report.days) rows.push(['day', d.date, '', ...CSV_COLUMNS.map((k) => cell(d[k]))].join(','));
  for (const b of report.byBranch) rows.push(['branch', cell(b.branchId), cell(b.branchName), ...CSV_COLUMNS.map((k) => cell(b[k]))].join(','));
  for (const c of report.byCashier) rows.push(['cashier', cell(c.cashierId), cell(c.cashierName), ...CSV_COLUMNS.map((k) => cell(c[k]))].join(','));
  rows.push(['total', '', `timezone ${report.timezone}`, ...CSV_COLUMNS.map((k) => cell(report.totals[k]))].join(','));
  return rows.join('\n') + '\n';
}
