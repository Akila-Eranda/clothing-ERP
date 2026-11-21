import { round2 } from '@/modules/pricing/pricing.helper';

/**
 * Upper bound for the cashier's bill-level (manual) discount (audit P-F2, cap only).
 *
 * calculateCartTotals applies order discounts to the taxed total:
 *   totalBeforeLoyalty = subtotal (after line discounts) + tax − (manual + coupon + tier)
 * so the manual discount may never exceed what is left to sell after the coupon and tier discounts.
 * A larger value is refused (it used to produce a negative total that was clamped to LKR 0).
 *
 * This is a cap only: whether a large (but in-range) discount needs manager approval is a separate,
 * undecided policy and is NOT implemented here. Line discounts are unaffected.
 */
export type BillDiscountInput = {
  manualDiscount: number | null | undefined;
  subtotal: number;
  taxAmount: number;
  couponDiscount?: number | null;
  tierDiscount?: number | null;
};

/** The largest manual bill discount the sale can take. */
export function maxBillDiscount(input: Omit<BillDiscountInput, 'manualDiscount'>): number {
  return round2(
    Math.max(0, input.subtotal + input.taxAmount - Math.max(0, input.couponDiscount ?? 0) - Math.max(0, input.tierDiscount ?? 0)),
  );
}

/** Error message when the manual bill discount exceeds the bill, else null (half-cent tolerance). */
export function billDiscountRejection(input: BillDiscountInput): string | null {
  const manual = input.manualDiscount ?? 0;
  if (!Number.isFinite(manual)) return 'Bill discount must be a number';
  if (manual <= 0) return null;
  const max = maxBillDiscount(input);
  if (manual > max + 0.005) {
    return `Bill discount LKR ${manual.toFixed(2)} is more than the bill (LKR ${max.toFixed(2)}).`;
  }
  return null;
}
