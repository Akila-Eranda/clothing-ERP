import { CustomerTier, DiscountType, PaymentMethod } from '@prisma/client';

export const TIER_DISCOUNT_PERCENT: Record<CustomerTier, number> = {
  [CustomerTier.BRONZE]: 0,
  [CustomerTier.SILVER]: 3,
  [CustomerTier.GOLD]: 5,
  [CustomerTier.PLATINUM]: 8,
  [CustomerTier.DIAMOND]: 10,
};

export function tierDiscountAmount(subtotal: number, tier: CustomerTier): number {
  const pct = TIER_DISCOUNT_PERCENT[tier] ?? 0;
  if (pct <= 0) return 0;
  return Math.round((subtotal * pct) / 100 * 100) / 100;
}

export function computePromotionDiscount(
  discountType: DiscountType,
  discountValue: number,
  orderAmount: number,
  maxDiscount?: number | null,
): number {
  let discountAmount = 0;
  if (discountType === DiscountType.PERCENTAGE) {
    discountAmount = (orderAmount * discountValue) / 100;
    if (maxDiscount) discountAmount = Math.min(discountAmount, maxDiscount);
  } else if (discountType === DiscountType.FIXED) {
    discountAmount = discountValue;
  }
  return Math.min(discountAmount, orderAmount);
}

export function buildPaymentsSummary(methods: PaymentMethod[]): string {
  if (methods.length <= 1) return methods[0] ?? PaymentMethod.CASH;
  return methods.join('+');
}
