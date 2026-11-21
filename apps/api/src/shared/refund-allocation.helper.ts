import { PaymentMethod } from '@prisma/client';

export type RefundPart = { method: PaymentMethod; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How a refund goes back, by the tenders of the original sale (proportional). Cash counts only what
 * the shop kept (cash paid minus change), so a split card + cash sale never refunds the card part from
 * the drawer. Parts always add up to the refund; rounding cents go to the largest part.
 * A sale with no usable payments refunds in cash (previous behaviour).
 */
export function allocateRefundByTender(
  payments: { method: PaymentMethod; amount: number }[],
  changeDue: number,
  refundAmount: number,
): RefundPart[] {
  const refund = r2(refundAmount);
  if (!(refund > 0)) return [];
  const byMethod = new Map<PaymentMethod, number>();
  for (const p of payments) {
    if (!(p.amount > 0)) continue;
    byMethod.set(p.method, r2((byMethod.get(p.method) ?? 0) + p.amount));
  }
  if (byMethod.has(PaymentMethod.CASH)) {
    const net = r2(byMethod.get(PaymentMethod.CASH)! - Math.max(0, changeDue || 0));
    if (net > 0.004) byMethod.set(PaymentMethod.CASH, net);
    else byMethod.delete(PaymentMethod.CASH);
  }
  const total = [...byMethod.values()].reduce((s, v) => s + v, 0);
  if (!(total > 0)) return [{ method: PaymentMethod.CASH, amount: refund }];

  const parts: RefundPart[] = [...byMethod.entries()].map(([method, amt]) => ({ method, amount: r2((refund * amt) / total) }));
  const diff = r2(refund - parts.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(diff) > 0.004) {
    const largest = parts.reduce((a, b) => (b.amount > a.amount ? b : a));
    largest.amount = r2(largest.amount + diff);
  }
  return parts.filter((p) => p.amount > 0.004);
}

/**
 * Splits an amount over keys in proportion to their weights (e.g. a QR refund share over the bank
 * accounts the sale was paid into, or a gift-voucher share over the vouchers used). Parts add up to the
 * amount; rounding cents go to the largest part. Keys with no positive weight get nothing.
 */
export function splitProportional<K>(amount: number, weights: { key: K; weight: number }[]): { key: K; amount: number }[] {
  const total = r2(amount);
  const usable = new Map<K, number>();
  for (const w of weights) if (w.weight > 0) usable.set(w.key, (usable.get(w.key) ?? 0) + w.weight);
  const sum = [...usable.values()].reduce((s, v) => s + v, 0);
  if (!(total > 0) || !(sum > 0)) return [];
  const parts = [...usable.entries()].map(([key, w]) => ({ key, amount: r2((total * w) / sum) }));
  const diff = r2(total - parts.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(diff) > 0.004) {
    const largest = parts.reduce((a, b) => (b.amount > a.amount ? b : a));
    largest.amount = r2(largest.amount + diff);
  }
  return parts.filter((p) => p.amount > 0.004);
}

/** Cash share of a refund (0 when the original sale took no cash). */
export function cashRefundPart(parts: RefundPart[]): number {
  return r2(parts.filter((p) => p.method === PaymentMethod.CASH).reduce((s, p) => s + p.amount, 0));
}

/**
 * Tenders to refund against: the sale's payments, plus the unpaid balance of a partial-pay sale (which
 * was charged to the customer's credit and is reversed there, never paid out in cash).
 */
export function refundTenders(sale: {
  total: number;
  changeDue?: number | null;
  paymentMethod?: PaymentMethod | null;
  payments: { method: PaymentMethod; amount: number }[];
}) {
  // Older sales without payment rows: the whole bill was paid by the sale's payment method.
  if (!sale.payments.some((p) => p.amount > 0)) {
    return [{ method: sale.paymentMethod ?? PaymentMethod.CASH, amount: sale.total }];
  }
  const paid = sale.payments.reduce((s, p) => s + (p.amount > 0 ? p.amount : 0), 0) - Math.max(0, sale.changeDue ?? 0);
  const unpaid = r2(sale.total - paid);
  return unpaid > 0.009 ? [...sale.payments, { method: PaymentMethod.CUSTOMER_CREDIT, amount: unpaid }] : sale.payments;
}
