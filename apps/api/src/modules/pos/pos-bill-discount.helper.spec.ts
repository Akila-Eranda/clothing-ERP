import { calculateCartTotals } from '@/modules/pricing/pricing.helper';
import { billDiscountRejection, maxBillDiscount } from './pos-bill-discount.helper';

/** Run the real pricing stack, then the cap — the same order createSale uses. */
const check = (manual: number, opts: { taxRate?: number; coupon?: number; tier?: number; lineDiscount?: number } = {}) => {
  const t = calculateCartTotals({
    items: [{ unitPrice: 100, quantity: 2, taxRate: opts.taxRate ?? 0, discount: opts.lineDiscount ?? 0, discountType: 'FIXED' }],
    manualDiscount: manual,
    couponDiscount: opts.coupon ?? 0,
    tierDiscount: opts.tier ?? 0,
  });
  return { totals: t, rejection: billDiscountRejection({ ...t, manualDiscount: manual }) };
};

describe('pos-bill-discount.helper (P-F2, cap only)', () => {
  it('refuses a bill discount far larger than the bill (no LKR 0 sale from one field)', () => {
    const r = check(100_000);
    expect(r.rejection).toMatch(/more than the bill \(LKR 200\.00\)/);
  });

  it('refuses a discount 1 cent over the bill', () => {
    expect(check(200.01).rejection).not.toBeNull();
  });

  it('allows a discount equal to the bill (approval threshold is a separate, undecided policy)', () => {
    expect(check(200).rejection).toBeNull();
  });

  it('CONTROL: a normal LKR 10 discount is applied as before', () => {
    const r = check(10);
    expect(r.rejection).toBeNull();
    expect(r.totals.amountDue).toBe(190);
  });

  it('CONTROL: no / zero discount is never refused', () => {
    expect(billDiscountRejection({ manualDiscount: undefined, subtotal: 0, taxAmount: 0 })).toBeNull();
    expect(billDiscountRejection({ manualDiscount: 0, subtotal: 0, taxAmount: 0 })).toBeNull();
  });

  it('counts tax: the discount may cover the taxed total (calculateCartTotals discounts subtotal + tax)', () => {
    // 200 + 10% tax = 220
    expect(check(220, { taxRate: 10 }).rejection).toBeNull();
    expect(check(220.5, { taxRate: 10 }).rejection).not.toBeNull();
  });

  it('counts line discounts: the cap is on the merchandise after line discounts', () => {
    expect(check(150, { lineDiscount: 50 }).rejection).toBeNull();
    expect(check(151, { lineDiscount: 50 }).rejection).not.toBeNull();
  });

  it('leaves room for coupon and tier discounts already applied (total never negative)', () => {
    expect(maxBillDiscount({ subtotal: 200, taxAmount: 0, couponDiscount: 30, tierDiscount: 20 })).toBe(150);
    expect(check(150, { coupon: 30, tier: 20 }).rejection).toBeNull();
    expect(check(151, { coupon: 30, tier: 20 }).rejection).not.toBeNull();
    expect(check(150, { coupon: 30, tier: 20 }).totals.totalBeforeLoyalty).toBe(0);
  });

  it('refuses a non-finite discount', () => {
    expect(billDiscountRejection({ manualDiscount: Number.POSITIVE_INFINITY, subtotal: 200, taxAmount: 0 })).not.toBeNull();
    expect(billDiscountRejection({ manualDiscount: Number.NaN, subtotal: 200, taxAmount: 0 })).not.toBeNull();
  });
});
