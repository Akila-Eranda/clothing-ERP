import { CustomerTier, DiscountType } from '@prisma/client';
import {
  breakdownCartLine,
  calculateCartTotals,
  computePromotionDiscount,
  lineDiscountAmount,
  loyaltyDiscountFromPoints,
  loyaltyPointsEarned,
  resolveUnitPrice,
  tierDiscountAmount,
  TIER_DISCOUNT_PERCENT,
} from './pricing.helper';

describe('Pricing Engine helpers', () => {
  it('applies tier discount percents', () => {
    expect(TIER_DISCOUNT_PERCENT[CustomerTier.GOLD]).toBe(5);
    expect(tierDiscountAmount(1000, CustomerTier.GOLD)).toBe(50);
    expect(tierDiscountAmount(1000, CustomerTier.BRONZE)).toBe(0);
  });

  it('computes percentage and fixed promotions', () => {
    expect(computePromotionDiscount(DiscountType.PERCENTAGE, 10, 500)).toBe(50);
    expect(computePromotionDiscount(DiscountType.PERCENTAGE, 50, 500, 100)).toBe(100);
    expect(computePromotionDiscount(DiscountType.FIXED, 75, 500)).toBe(75);
    expect(computePromotionDiscount(DiscountType.FIXED, 900, 500)).toBe(500);
  });

  it('breaks down a cart line with % discount and tax', () => {
    const line = breakdownCartLine({
      unitPrice: 100,
      quantity: 2,
      discount: 10,
      discountType: 'PERCENTAGE',
      taxRate: 10,
    });
    expect(line.lineTotal).toBe(200);
    expect(line.discount).toBe(20);
    expect(line.taxable).toBe(180);
    expect(line.taxAmount).toBe(18);
    expect(line.net).toBe(198);
  });

  it('calculates full cart totals with coupon, tier, loyalty', () => {
    const totals = calculateCartTotals({
      items: [{ unitPrice: 100, quantity: 2, discount: 0, taxRate: 0 }],
      manualDiscount: 10,
      couponDiscount: 5,
      tierDiscount: 6,
      loyaltyPointsToRedeem: 50,
      availableLoyaltyPoints: 100,
    });
    expect(totals.subtotal).toBe(200);
    expect(totals.orderDiscountTotal).toBe(21);
    expect(totals.loyaltyDiscount).toBe(5);
    expect(totals.pointsRedeemed).toBe(50);
    expect(totals.amountDue).toBeGreaterThan(0);
    expect(loyaltyDiscountFromPoints(10)).toBe(1);
    expect(loyaltyPointsEarned(250)).toBe(2);
  });

  it('resolves scale barcode price over catalog', () => {
    expect(resolveUnitPrice(120, 85.5)).toBe(85.5);
    expect(resolveUnitPrice(120, 0.5)).toBe(120);
    expect(resolveUnitPrice(120, null)).toBe(120);
  });

  it('caps line discount at line total', () => {
    expect(lineDiscountAmount(50, 80, 'FIXED')).toBe(50);
  });
});
