/** Sprint 9 — Fixed Assets helpers (pure). */

export type DepScheduleRow = {
  periodIndex: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  depreciation: number;
  accumulated: number;
  bookValue: number;
};

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function monthsBetween(start: Date, end: Date): number {
  const y = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  return y * 12 + m;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return out;
}

export function monthPeriod(year: number, monthIndex: number): {
  label: string;
  start: Date;
  end: Date;
} {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const label = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return { label, start, end };
}

/** Monthly straight-line charge. */
export function straightLineMonthly(cost: number, residual: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciable = Math.max(0, cost - residual);
  return roundMoney(depreciable / usefulLifeMonths);
}

/** Monthly declining-balance charge from current book value. */
export function decliningBalanceMonthly(
  bookValue: number,
  residual: number,
  annualRatePct: number,
): number {
  const rate = annualRatePct / 100 / 12;
  if (rate <= 0 || bookValue <= residual) return 0;
  const raw = roundMoney(bookValue * rate);
  return roundMoney(Math.min(raw, Math.max(0, bookValue - residual)));
}

export function computePeriodDepreciation(params: {
  method: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  decliningRate?: number | null;
  accumulatedDep: number;
  bookValue: number;
}): number {
  if (params.method === 'NONE') return 0;
  const maxDep = roundMoney(Math.max(0, params.bookValue - params.residualValue));
  if (maxDep <= 0) return 0;

  let amount = 0;
  if (params.method === 'DECLINING_BALANCE') {
    const rate = params.decliningRate ?? (params.usefulLifeMonths > 0 ? (2 / params.usefulLifeMonths) * 12 * 100 : 0);
    amount = decliningBalanceMonthly(params.bookValue, params.residualValue, rate);
  } else {
    amount = straightLineMonthly(params.cost, params.residualValue, params.usefulLifeMonths);
  }
  return roundMoney(Math.min(amount, maxDep));
}

/** Full projected schedule from acquisition (ignores prior postings). */
export function buildDepreciationSchedule(params: {
  acquisitionDate: Date | string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method?: string;
  decliningRate?: number | null;
  maxPeriods?: number;
}): DepScheduleRow[] {
  const acq = new Date(params.acquisitionDate);
  const method = params.method ?? 'STRAIGHT_LINE';
  const life = Math.max(0, params.usefulLifeMonths);
  const maxPeriods = params.maxPeriods ?? life;
  const rows: DepScheduleRow[] = [];

  let accum = 0;
  let book = roundMoney(params.cost);
  let y = acq.getFullYear();
  let m = acq.getMonth();

  for (let i = 0; i < maxPeriods && i < 600; i++) {
    const { label, start, end } = monthPeriod(y, m);
    const dep = computePeriodDepreciation({
      method,
      cost: params.cost,
      residualValue: params.residualValue,
      usefulLifeMonths: life,
      decliningRate: params.decliningRate,
      accumulatedDep: accum,
      bookValue: book,
    });
    if (dep <= 0 && method !== 'NONE') break;
    accum = roundMoney(accum + dep);
    book = roundMoney(params.cost - accum);
    rows.push({
      periodIndex: i + 1,
      periodLabel: label,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      depreciation: dep,
      accumulated: accum,
      bookValue: book,
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (book <= params.residualValue + 0.001) break;
  }
  return rows;
}

export function disposalGainLoss(bookValue: number, proceeds: number): number {
  return roundMoney(proceeds - bookValue);
}
