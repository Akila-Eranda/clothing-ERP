/** Sprint 8 — Petty Cash helpers (pure). */

export type PettyCashBookLine = {
  id: string;
  type: string;
  txnDate: Date | string;
  description: string;
  category?: string | null;
  amount: number;
  /** Positive = in (replenish/opening), negative = out (disbursement) */
  signedAmount: number;
  balanceAfter: number;
};

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Balance delta by transaction type. */
export function pettyCashDelta(type: string, amount: number): number {
  const a = Math.abs(amount);
  switch (type) {
    case 'OPENING':
    case 'REPLENISHMENT':
      return roundMoney(a);
    case 'DISBURSEMENT':
      return roundMoney(-a);
    case 'ADJUSTMENT':
      return roundMoney(amount); // signed adjustment
    default:
      return 0;
  }
}

export function applyPettyCashBalance(current: number, type: string, amount: number): number {
  return roundMoney(current + pettyCashDelta(type, amount));
}

export function assertSufficientFloat(balance: number, amount: number, label = 'Petty cash'): void {
  if (roundMoney(balance - Math.abs(amount)) < -0.001) {
    throw new Error(`${label} balance insufficient (have ${balance}, need ${amount})`);
  }
}

export function replenishAmount(floatAmount: number, currentBalance: number, requested?: number): number {
  const shortfall = roundMoney(Math.max(0, floatAmount - currentBalance));
  if (requested == null || Number.isNaN(requested)) return shortfall;
  return roundMoney(Math.min(Math.abs(requested), shortfall || Math.abs(requested)));
}

export function summarizePettyCashBook(lines: Array<{ type: string; amount: number; category?: string | null }>) {
  let disbursements = 0;
  let replenishments = 0;
  let openings = 0;
  let adjustments = 0;
  const byCategory = new Map<string, number>();

  for (const l of lines) {
    const a = Math.abs(l.amount);
    if (l.type === 'DISBURSEMENT') {
      disbursements = roundMoney(disbursements + a);
      const key = (l.category || 'Uncategorized').trim() || 'Uncategorized';
      byCategory.set(key, roundMoney((byCategory.get(key) ?? 0) + a));
    } else if (l.type === 'REPLENISHMENT') {
      replenishments = roundMoney(replenishments + a);
    } else if (l.type === 'OPENING') {
      openings = roundMoney(openings + a);
    } else if (l.type === 'ADJUSTMENT') {
      adjustments = roundMoney(adjustments + l.amount);
    }
  }

  return {
    disbursements,
    replenishments,
    openings,
    adjustments,
    netOutflow: roundMoney(disbursements - replenishments),
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
