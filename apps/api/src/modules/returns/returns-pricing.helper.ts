import { FractionRuleProduct, fractionalQuantityRejection, isWholeQuantity } from '../pos/pos-quantity.helper';

/**
 * Server-side refund pricing (audit F-02). The refund never comes from a client-sent price:
 *
 *   unit refund = (line.total / line.quantity) × (sale.total / Σ line.total)
 *
 * i.e. what the customer actually paid per unit: net of the line discount, with bill-level discount,
 * coupon, loyalty and round-off spread proportionally. Returning every unit of every line refunds
 * exactly sale.total. Quantities are checked cumulatively against earlier returns of the same sale.
 */

export interface SaleLineForReturn {
  variantId: string | null;
  quantity: number;
  total: number;
  productName: string;
}

export interface ReturnRequestLine {
  variantId: string;
  quantity: number;
}

export interface PricedReturnLine {
  variantId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

const EPS = 1e-6;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export class ReturnPricingError extends Error {}

/**
 * A previously sold fractional line remains returnable if its product was later changed to piece/count settings.
 * The caller still enforces the cumulative quantity cap against all quantities on the original sale.
 */
export function fractionalReturnQuantityRejection(
  name: string,
  variantId: string,
  quantity: number,
  product: FractionRuleProduct,
  originalSaleLines: SaleLineForReturn[],
): string | null {
  const rejection = fractionalQuantityRejection(name, quantity, product);
  if (!rejection) return null;
  const wasSoldFractionally = originalSaleLines.some(
    (line) => line.variantId === variantId && !isWholeQuantity(line.quantity),
  );
  return wasSoldFractionally ? null : rejection;
}

export function areSaleLinesFullyReturned(
  saleLines: Pick<SaleLineForReturn, 'variantId' | 'quantity'>[],
  returnedByVariant: ReadonlyMap<string, number>,
): boolean {
  const soldByVariant = new Map<string, number>();
  for (const line of saleLines) {
    const variantId = line.variantId ?? '';
    soldByVariant.set(variantId, (soldByVariant.get(variantId) ?? 0) + line.quantity);
  }

  return [...soldByVariant].every(
    ([variantId, soldQuantity]) =>
      round3(returnedByVariant.get(variantId) ?? 0) >= round3(soldQuantity),
  );
}

/**
 * @param lines            the original sale's lines
 * @param saleTotal        sale.total (what was charged)
 * @param requested        lines the cashier wants to return now
 * @param alreadyReturned  variantId → quantity returned by earlier, non-rejected returns of this sale
 */
export function priceReturn(
  lines: SaleLineForReturn[],
  saleTotal: number,
  requested: ReturnRequestLine[],
  alreadyReturned: Map<string, number>,
): { lines: PricedReturnLine[]; totalAmount: number } {
  const linesTotal = lines.reduce((s, l) => s + (l.total > 0 ? l.total : 0), 0);
  const billFactor = linesTotal > 0 ? Math.min(1, Math.max(0, saleTotal / linesTotal)) : 0;

  // Several requested rows for the same variant are combined before checking.
  const wanted = new Map<string, number>();
  for (const r of requested) {
    if (!(r.quantity > 0)) throw new ReturnPricingError('Return quantity must be greater than zero');
    wanted.set(r.variantId, round3((wanted.get(r.variantId) ?? 0) + r.quantity));
  }

  const priced: PricedReturnLine[] = [];
  for (const [variantId, qty] of wanted) {
    const sold = lines.filter((l) => l.variantId === variantId);
    if (!sold.length) throw new ReturnPricingError('Returned item was not on the original invoice');
    const soldQty = round3(sold.reduce((s, l) => s + l.quantity, 0));
    const soldValue = sold.reduce((s, l) => s + (l.total > 0 ? l.total : 0), 0);
    const before = alreadyReturned.get(variantId) ?? 0;
    if (qty + before > soldQty + EPS) {
      const left = Math.max(0, round3(soldQty - before));
      throw new ReturnPricingError(`Return quantity exceeds what can still be returned for ${sold[0].productName} (sold ${soldQty}, already returned ${round3(before)}, left ${left})`);
    }
    const unitPrice = soldQty > 0 ? (soldValue / soldQty) * billFactor : 0;
    priced.push({ variantId, quantity: qty, unitPrice: round2(unitPrice), totalAmount: round2(unitPrice * qty) });
  }

  // Never refund more than what is left of the sale value (guards cumulative rounding).
  const previouslyRefundedValue = [...alreadyReturned.entries()].reduce((s, [v, q]) => {
    const sold = lines.filter((l) => l.variantId === v);
    const sq = sold.reduce((a, l) => a + l.quantity, 0);
    const sv = sold.reduce((a, l) => a + (l.total > 0 ? l.total : 0), 0);
    return s + (sq > 0 ? (sv / sq) * billFactor * q : 0);
  }, 0);
  let totalAmount = round2(priced.reduce((s, l) => s + l.totalAmount, 0));
  const ceiling = round2(Math.max(0, saleTotal - previouslyRefundedValue));
  if (totalAmount > ceiling) totalAmount = ceiling;
  return { lines: priced, totalAmount };
}

/** Refunds above this amount (LKR) need manager authority unless the tenant sets its own limit. */
export const DEFAULT_REFUND_MANAGER_APPROVAL_ABOVE = 5000;

export function refundApprovalLimit(settings: unknown): number {
  const s = (settings ?? {}) as { pos?: { refundManagerApprovalAbove?: unknown } };
  const v = Number(s.pos?.refundManagerApprovalAbove);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_REFUND_MANAGER_APPROVAL_ABOVE;
}

/**
 * Allowed return status changes (F-02 follow-up). Same table the web UI offers. In particular an
 * APPROVED return (refund and stock already applied) can never become REJECTED or INITIATED: rejected
 * returns do not count towards the "already returned" quantity, so that change would allow a second
 * refund of the same items.
 */
const RETURN_TRANSITIONS: Record<string, readonly string[]> = {
  INITIATED: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED', 'REFUND_PROCESSED'],
};

export function canChangeReturnStatus(from: string, to: string): boolean {
  return (RETURN_TRANSITIONS[from] ?? []).includes(to);
}
