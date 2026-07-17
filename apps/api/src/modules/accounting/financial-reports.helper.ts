/** Sprint 11 — Financial report helpers (pure). */

import { AccountType } from '@prisma/client';

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isDebitNormal(type: AccountType | string): boolean {
  return type === AccountType.ASSET || type === AccountType.EXPENSE || type === 'ASSET' || type === 'EXPENSE';
}

/** Split signed balance into TB debit/credit columns. */
export function trialBalanceColumns(
  type: AccountType | string,
  balance: number,
): { debit: number; credit: number } {
  const b = roundMoney(balance);
  if (Math.abs(b) < 0.005) return { debit: 0, credit: 0 };
  if (isDebitNormal(type)) {
    return b >= 0 ? { debit: b, credit: 0 } : { debit: 0, credit: roundMoney(-b) };
  }
  return b >= 0 ? { debit: 0, credit: b } : { debit: roundMoney(-b), credit: 0 };
}

export type TbRow = {
  code: string;
  name: string;
  type: string;
  balance: number;
  debit: number;
  credit: number;
};

export function buildTrialBalance(
  accounts: Array<{ code: string; name: string; type: string; balance: number }>,
): { rows: TbRow[]; totalDebit: number; totalCredit: number; balanced: boolean } {
  const rows = accounts.map((a) => {
    const { debit, credit } = trialBalanceColumns(a.type, a.balance);
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      balance: roundMoney(a.balance),
      debit,
      credit,
    };
  });
  const totalDebit = roundMoney(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = roundMoney(rows.reduce((s, r) => s + r.credit, 0));
  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.02,
  };
}

/** Period net for an account: debit-normal → debits − credits; else credits − debits. */
export function periodNet(
  type: AccountType | string,
  debits: number,
  credits: number,
): number {
  if (isDebitNormal(type)) return roundMoney(debits - credits);
  return roundMoney(credits - debits);
}

export type PlLine = { code: string; name: string; amount: number };

export function buildProfitLoss(
  revenueLines: PlLine[],
  expenseLines: PlLine[],
): {
  revenue: { lines: PlLine[]; total: number };
  expenses: { lines: PlLine[]; total: number };
  netProfit: number;
} {
  const revTotal = roundMoney(revenueLines.reduce((s, l) => s + l.amount, 0));
  const expTotal = roundMoney(expenseLines.reduce((s, l) => s + l.amount, 0));
  return {
    revenue: { lines: revenueLines.filter((l) => Math.abs(l.amount) > 0.004), total: revTotal },
    expenses: { lines: expenseLines.filter((l) => Math.abs(l.amount) > 0.004), total: expTotal },
    netProfit: roundMoney(revTotal - expTotal),
  };
}

export type BsSection = {
  lines: Array<{ code: string; name: string; balance: number }>;
  total: number;
};

export function buildBalanceSheet(accounts: Array<{
  code: string;
  name: string;
  type: string;
  balance: number;
}>): {
  assets: BsSection;
  liabilities: BsSection;
  equity: BsSection;
  totalAssets: number;
  totalLiabilitiesEquity: number;
  balanced: boolean;
} {
  const section = (type: string): BsSection => {
    const lines = accounts
      .filter((a) => a.type === type && Math.abs(a.balance) > 0.004)
      .map((a) => ({ code: a.code, name: a.name, balance: roundMoney(a.balance) }));
    return { lines, total: roundMoney(lines.reduce((s, l) => s + l.balance, 0)) };
  };
  const assets = section('ASSET');
  const liabilities = section('LIABILITY');
  const equity = section('EQUITY');
  // Close P&L into equity for BS balance when REVENUE/EXPENSE still on books
  const rev = roundMoney(
    accounts.filter((a) => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0),
  );
  const exp = roundMoney(
    accounts.filter((a) => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0),
  );
  const currentPl = roundMoney(rev - exp);
  if (Math.abs(currentPl) > 0.004) {
    equity.lines.push({ code: 'PL', name: 'Current period P&L', balance: currentPl });
    equity.total = roundMoney(equity.total + currentPl);
  }
  const totalAssets = assets.total;
  const totalLiabilitiesEquity = roundMoney(liabilities.total + equity.total);
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilitiesEquity,
    balanced: Math.abs(totalAssets - totalLiabilitiesEquity) < 1,
  };
}

export type CashFlowBucket = {
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
};

/** Classify cash movement by journal referenceType / account code. */
export function classifyCashFlowMovement(params: {
  referenceType?: string | null;
  accountCode?: string;
  signedAmount: number; // + inflow to cash
}): 'operating' | 'investing' | 'financing' {
  const ref = (params.referenceType || '').toUpperCase();
  if (ref.startsWith('FA_') || ref.includes('FIXED') || ref.includes('DISPOSAL')) return 'investing';
  if (ref.includes('OWNER') || ref.includes('CAPITAL') || ref.includes('EQUITY') || ref.includes('LOAN')) {
    return 'financing';
  }
  const code = params.accountCode || '';
  if (code.startsWith('3')) return 'financing';
  if (code.startsWith('15') || code.startsWith('16')) return 'investing';
  return 'operating';
}

export function summarizeCashFlowBuckets(
  items: Array<{ bucket: 'operating' | 'investing' | 'financing'; amount: number }>,
): CashFlowBucket {
  let operating = 0;
  let investing = 0;
  let financing = 0;
  for (const i of items) {
    if (i.bucket === 'operating') operating += i.amount;
    else if (i.bucket === 'investing') investing += i.amount;
    else financing += i.amount;
  }
  operating = roundMoney(operating);
  investing = roundMoney(investing);
  financing = roundMoney(financing);
  return {
    operating,
    investing,
    financing,
    netChange: roundMoney(operating + investing + financing),
  };
}

export const REPORT_TYPES = [
  'trial-balance',
  'profit-loss',
  'balance-sheet',
  'cash-flow',
  'general-ledger',
  'customer-statement',
  'supplier-statement',
  'vat',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(v: string): v is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(v);
}
