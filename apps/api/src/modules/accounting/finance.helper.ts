/** Pure finance helpers — unit-tested for report accuracy. */

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus';

export type AgingLine = {
  id: string;
  partyName: string;
  amount: number;
  asOfDate: Date;
  dueOrRefDate: Date;
};

export type AgingSummary = {
  buckets: Record<AgingBucket, { count: number; amount: number }>;
  total: number;
  lines: (AgingLine & { bucket: AgingBucket; daysPastDue: number })[];
};

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function classifyAging(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '1_30';
  if (daysPastDue <= 60) return '31_60';
  if (daysPastDue <= 90) return '61_90';
  return '90_plus';
}

export function buildAgingReport(lines: AgingLine[], asOf = new Date()): AgingSummary {
  const buckets: AgingSummary['buckets'] = {
    current: { count: 0, amount: 0 },
    '1_30': { count: 0, amount: 0 },
    '31_60': { count: 0, amount: 0 },
    '61_90': { count: 0, amount: 0 },
    '90_plus': { count: 0, amount: 0 },
  };

  const enriched = lines
    .filter((l) => l.amount > 0.009)
    .map((l) => {
      const daysPastDue = daysBetween(l.dueOrRefDate, asOf);
      const bucket = classifyAging(daysPastDue);
      buckets[bucket].count += 1;
      buckets[bucket].amount += l.amount;
      return { ...l, bucket, daysPastDue };
    });

  const total = enriched.reduce((s, l) => s + l.amount, 0);
  return { buckets, total, lines: enriched };
}

export type PlInput = {
  grossRevenue: number;
  returns: number;
  cogs: number;
  expenses: number;
  otherIncome?: number;
};

export type PlResult = {
  netRevenue: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: number;
  otherIncome: number;
  netProfit: number;
  netMarginPct: number;
};

/** Deterministic P&L math used by API + tests. */
export function computeProfitLoss(input: PlInput): PlResult {
  const netRevenue = round2(input.grossRevenue - input.returns);
  const grossProfit = round2(netRevenue - input.cogs);
  const otherIncome = round2(input.otherIncome ?? 0);
  const operatingExpenses = round2(input.expenses);
  const netProfit = round2(grossProfit - operatingExpenses + otherIncome);
  return {
    netRevenue,
    grossProfit,
    grossMarginPct: netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0,
    operatingExpenses,
    otherIncome,
    netProfit,
    netMarginPct: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function cashBookRunningBalance(
  opening: number,
  entries: { debit: number; credit: number }[],
): { balances: number[]; closing: number } {
  let bal = opening;
  const balances: number[] = [];
  for (const e of entries) {
    bal = round2(bal + e.debit - e.credit);
    balances.push(bal);
  }
  return { balances, closing: bal };
}

export function bankReconDifference(statementBalance: number, systemBalance: number): number {
  return round2(statementBalance - systemBalance);
}

export function chequeClearEffect(
  direction: 'RECEIVED' | 'ISSUED',
  amount: number,
): { bankDelta: number } {
  // Received cheques increase bank when cleared; issued decrease
  return { bankDelta: direction === 'RECEIVED' ? round2(amount) : round2(-amount) };
}
