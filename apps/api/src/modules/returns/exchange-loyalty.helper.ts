/**
 * Pure rules for exchanges and loyalty on returns (no database here, see the spec).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export const EXCHANGE_PAYMENT_METHODS = ['CASH', 'CARD', 'QR', 'BANK_TRANSFER'] as const;
export type ExchangePaymentMethod = (typeof EXCHANGE_PAYMENT_METHODS)[number];
export type ExchangePayment = { method: ExchangePaymentMethod; amount: number; cardLast4?: string; bankAccountId?: string; reference?: string };

export type ExchangeSettlement = {
  /** Value of the goods taken back (priced from the original sale). */
  returned: number;
  /** Value of the goods given out (catalogue price). */
  issued: number;
  /** What the customer still had to pay (issued > returned). */
  due: number;
  /** What was collected for `due`, by tender (cash net of change). */
  collected: { method: ExchangePaymentMethod; amount: number; cardLast4?: string; bankAccountId?: string; reference?: string }[];
  /** Change given back from the cash tendered. */
  change: number;
  /** What the shop owed the customer (returned > issued). */
  excess: number;
  /** How the excess went back: to the original tenders, or as store credit in the customer's wallet. */
  excessAs: 'REFUND' | 'STORE_CREDIT' | null;
};

export class ExchangeSettlementError extends Error {}

/**
 * Settles an exchange: returned goods vs. goods issued.
 * - issued > returned → the difference must be collected now by normal tenders (cash may exceed it;
 *   the rest is change). Card / QR / bank must match exactly.
 * - returned > issued → the excess is refunded to the original tenders, or given as store credit.
 * - equal → nothing moves (no payment may be sent).
 */
export function settleExchange(
  returned: number,
  issued: number,
  payments: ExchangePayment[] = [],
  excessAs: 'REFUND' | 'STORE_CREDIT' = 'REFUND',
): ExchangeSettlement {
  const ret = r2(returned);
  const iss = r2(issued);
  const diff = r2(iss - ret);
  const sent = payments.filter((p) => p.amount > 0);
  if (diff <= 0.004) {
    if (sent.length) throw new ExchangeSettlementError('No payment is due for this exchange');
    const excess = r2(-diff);
    return { returned: ret, issued: iss, due: 0, collected: [], change: 0, excess: excess > 0.004 ? excess : 0, excessAs: excess > 0.004 ? excessAs : null };
  }
  const due = diff;
  for (const p of sent) {
    if (!(EXCHANGE_PAYMENT_METHODS as readonly string[]).includes(p.method)) throw new ExchangeSettlementError(`Payment method ${p.method} is not accepted for an exchange`);
  }
  const cash = r2(sent.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0));
  const nonCash = r2(sent.filter((p) => p.method !== 'CASH').reduce((s, p) => s + p.amount, 0));
  if (nonCash > due + 0.004) throw new ExchangeSettlementError(`Card / QR / bank payments exceed the LKR ${due.toFixed(2)} due`);
  const total = r2(cash + nonCash);
  if (total + 0.004 < due) throw new ExchangeSettlementError(`Collect LKR ${due.toFixed(2)} for this exchange (received LKR ${total.toFixed(2)})`);
  const change = r2(total - due);
  const collected = sent
    .filter((p) => p.method !== 'CASH')
    .map((p) => ({ method: p.method, amount: r2(p.amount), ...(p.cardLast4 ? { cardLast4: p.cardLast4 } : {}), ...(p.bankAccountId ? { bankAccountId: p.bankAccountId } : {}), ...(p.reference ? { reference: p.reference } : {}) }));
  const cashNet = r2(cash - change);
  if (cashNet > 0.004) collected.unshift({ method: 'CASH', amount: cashNet });
  return { returned: ret, issued: iss, due, collected, change, excess: 0, excessAs: null };
}

export type LoyaltyAdjustment = {
  /** Earned points taken back now (≥ 0). */
  reverse: number;
  /** Redeemed points given back now (≥ 0). */
  restore: number;
  /** Earned points that should be taken back but the customer no longer has (not recovered now). */
  shortfall: number;
};

/**
 * Loyalty points for a refund, proportional to the value refunded, computed CUMULATIVELY over all
 * refunds of the sale so partial refunds never drift and repeating a computation never double-applies:
 *   target = floor(points × refundedSoFar / saleTotal); this refund applies target − alreadyApplied.
 * Earned points are reversed (rounded down, in the customer's favour); redeemed points are restored
 * (rounded down; a full refund restores everything). A reversal never takes the balance below zero —
 * the part that cannot be recovered is reported as `shortfall` (and retried by later refunds).
 */
export function loyaltyAdjustmentForRefund(opts: {
  pointsEarned: number;
  pointsRedeemed: number;
  saleTotal: number;
  /** Refund base of all refunds of this sale INCLUDING this one. */
  refundedSoFar: number;
  alreadyReversed: number;
  alreadyRestored: number;
  /** Customer's current point balance before this adjustment. */
  balance: number;
}): LoyaltyAdjustment {
  const total = opts.saleTotal > 0 ? opts.saleTotal : 0;
  const share = total > 0 ? Math.min(1, Math.max(0, opts.refundedSoFar / total)) : 0;
  const full = share >= 1 - 1e-9;
  const target = (pts: number) => (full ? Math.max(0, pts) : Math.floor(Math.max(0, pts) * share + 1e-9));
  const restore = Math.max(0, target(opts.pointsRedeemed) - Math.max(0, opts.alreadyRestored));
  const wanted = Math.max(0, target(opts.pointsEarned) - Math.max(0, opts.alreadyReversed));
  const available = Math.max(0, Math.floor(opts.balance) + restore);
  const reverse = Math.min(wanted, available);
  return { reverse, restore, shortfall: wanted - reverse };
}
