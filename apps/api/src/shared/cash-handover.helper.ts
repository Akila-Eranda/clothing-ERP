import { CashMovementType, CashRegisterStatus } from '@prisma/client';
import { computeExpectedCashFromMovements } from './cash-register.helper';

/**
 * Cash physically in a wallet's drawer: an open wallet holds what the movements say; a closed
 * (not yet cleared) wallet holds what was counted at close.
 */
export function walletDrawerAmount(wallet: {
  status: CashRegisterStatus;
  actualCash: number | null;
  openingCash: number;
  movements: { type: CashMovementType; amount: number }[];
}): { expectedCash: number; drawerCash: number } {
  const expectedCash = computeExpectedCashFromMovements(wallet.openingCash, wallet.movements);
  const amount = wallet.status === CashRegisterStatus.OPEN ? expectedCash : (wallet.actualCash ?? expectedCash);
  return { expectedCash, drawerCash: Math.round(amount * 100) / 100 };
}

export type HandoverWallet = {
  id: string;
  status: CashRegisterStatus;
  actualCash: number | null;
  openingCash: number;
  openingTime: Date;
  movements: { type: CashMovementType; amount: number }[];
};

export type HandoverPlan = {
  expectedTotal: number;
  countedTotal: number;
  variance: number;
  counted: boolean;
  wallets: { id: string; expected: number; counted: number; variance: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How a counter's drawer passes to the next cashier. Every earlier wallet still on the counter is
 * cleared at its drawer amount; the incoming cashier opens with the total (or with what was counted).
 * A count difference is booked on the most recent wallet first, never taking a wallet below zero.
 */
export function planHandover(wallets: HandoverWallet[], countedCash?: number | null): HandoverPlan {
  if (!wallets.length) throw new Error('No wallet to hand over');
  const ordered = [...wallets].sort((a, b) => a.openingTime.getTime() - b.openingTime.getTime());
  const rows = ordered.map((w) => {
    const { drawerCash } = walletDrawerAmount(w);
    return { id: w.id, expected: drawerCash, counted: drawerCash, variance: 0 };
  });
  const expectedTotal = r2(rows.reduce((s, r) => s + r.expected, 0));
  const counted = countedCash !== undefined && countedCash !== null;
  if (counted && (!Number.isFinite(countedCash) || countedCash! < 0)) {
    throw new Error('Counted cash must be zero or more');
  }
  const countedTotal = counted ? r2(countedCash!) : expectedTotal;
  let remaining = r2(countedTotal - expectedTotal);
  for (let i = rows.length - 1; i >= 0 && Math.abs(remaining) > 0.004; i--) {
    const row = rows[i];
    // Shortage: take at most what this wallet holds; overage: all of it on the latest wallet.
    const delta = remaining < 0 ? Math.max(remaining, -row.counted) : remaining;
    row.counted = r2(row.counted + delta);
    row.variance = r2(row.counted - row.expected);
    remaining = r2(remaining - delta);
  }
  return { expectedTotal, countedTotal, variance: r2(countedTotal - expectedTotal), counted, wallets: rows };
}
