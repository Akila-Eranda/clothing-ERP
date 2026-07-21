/** Pricing Engine — pure checkout / discount / loyalty math (no Nest DI). */

import { CustomerTier, DiscountType } from '@prisma/client';

export const TIER_DISCOUNT_PERCENT: Record<CustomerTier, number> = {
  [CustomerTier.BRONZE]: 0,
  [CustomerTier.SILVER]: 3,
  [CustomerTier.GOLD]: 5,
  [CustomerTier.PLATINUM]: 8,
  [CustomerTier.DIAMOND]: 10,
};

/** LKR value of one loyalty point when redeemed. */
export const LOYALTY_POINT_VALUE = 0.1;

/** Earn 1 point per this many currency units of amount due. */
export const LOYALTY_EARN_PER_AMOUNT = 100;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function tierDiscountAmount(subtotal: number, tier: CustomerTier): number {
  const pct = TIER_DISCOUNT_PERCENT[tier] ?? 0;
  if (pct <= 0 || subtotal <= 0) return 0;
  return round2((subtotal * pct) / 100);
}

export function computePromotionDiscount(
  discountType: DiscountType | string,
  discountValue: number,
  orderAmount: number,
  maxDiscount?: number | null,
): number {
  if (orderAmount <= 0 || discountValue < 0) return 0;
  let discountAmount = 0;
  if (discountType === DiscountType.PERCENTAGE || discountType === 'PERCENTAGE') {
    discountAmount = (orderAmount * discountValue) / 100;
    if (maxDiscount) discountAmount = Math.min(discountAmount, maxDiscount);
  } else if (discountType === DiscountType.FIXED || discountType === 'FIXED') {
    discountAmount = discountValue;
  }
  return round2(Math.min(discountAmount, orderAmount));
}

export function lineDiscountAmount(
  lineTotal: number,
  discount: number | null | undefined,
  discountType: DiscountType | string | null | undefined,
): number {
  const d = discount ?? 0;
  if (d <= 0 || lineTotal <= 0) return 0;
  if (discountType === DiscountType.PERCENTAGE || discountType === 'PERCENTAGE') {
    return round2(Math.min(lineTotal, (lineTotal * d) / 100));
  }
  return round2(Math.min(lineTotal, d));
}

export function lineTaxAmount(taxable: number, taxRate: number | null | undefined): number {
  const rate = taxRate ?? 0;
  if (taxable <= 0 || rate <= 0) return 0;
  return round2((taxable * rate) / 100);
}

export type CartLineInput = {
  unitPrice: number;
  quantity: number;
  discount?: number | null;
  discountType?: DiscountType | string | null;
  taxRate?: number | null;
};

export type CartLineBreakdown = {
  lineTotal: number;
  discount: number;
  taxable: number;
  taxAmount: number;
  net: number;
};

export function breakdownCartLine(item: CartLineInput): CartLineBreakdown {
  const lineTotal = round2(item.unitPrice * item.quantity);
  const discount = lineDiscountAmount(lineTotal, item.discount, item.discountType);
  const taxable = round2(lineTotal - discount);
  const taxAmount = lineTaxAmount(taxable, item.taxRate);
  return {
    lineTotal,
    discount,
    taxable,
    taxAmount,
    net: round2(taxable + taxAmount),
  };
}

export type CartTotalsInput = {
  items: CartLineInput[];
  manualDiscount?: number;
  couponDiscount?: number;
  tierDiscount?: number;
  loyaltyPointsToRedeem?: number;
  availableLoyaltyPoints?: number;
};

export type CartTotalsResult = {
  subtotal: number;
  taxAmount: number;
  lineDiscountTotal: number;
  manualDiscount: number;
  couponDiscount: number;
  tierDiscount: number;
  orderDiscountTotal: number;
  totalBeforeLoyalty: number;
  roundOff: number;
  finalTotal: number;
  loyaltyDiscount: number;
  pointsRedeemed: number;
  amountDue: number;
  pointsEarned: number;
};

/**
 * Full POS checkout pricing stack (before payment validation).
 * Order discounts apply on merchandise subtotal (after line discounts, before loyalty).
 */
export function calculateCartTotals(input: CartTotalsInput): CartTotalsResult {
  let subtotal = 0;
  let taxAmount = 0;
  let lineDiscountTotal = 0;

  for (const item of input.items) {
    const line = breakdownCartLine(item);
    subtotal = round2(subtotal + line.taxable);
    taxAmount = round2(taxAmount + line.taxAmount);
    lineDiscountTotal = round2(lineDiscountTotal + line.discount);
  }

  const manualDiscount = Math.max(0, input.manualDiscount ?? 0);
  const couponDiscount = Math.max(0, input.couponDiscount ?? 0);
  const tierDiscount = Math.max(0, input.tierDiscount ?? 0);
  const orderDiscountTotal = round2(manualDiscount + couponDiscount + tierDiscount);

  const totalBeforeLoyalty = round2(subtotal + taxAmount - orderDiscountTotal);
  const roundOff = round2(Math.round(totalBeforeLoyalty) - totalBeforeLoyalty);
  const finalTotal = round2(totalBeforeLoyalty + roundOff);

  const requestedPoints = Math.max(0, Math.floor(input.loyaltyPointsToRedeem ?? 0));
  const available = Math.max(0, Math.floor(input.availableLoyaltyPoints ?? 0));
  const pointsRedeemed = Math.min(requestedPoints, available);
  const loyaltyDiscount = round2(pointsRedeemed * LOYALTY_POINT_VALUE);

  const amountDue = round2(Math.max(0, finalTotal - loyaltyDiscount));
  const pointsEarned = amountDue > 0 ? Math.floor(amountDue / LOYALTY_EARN_PER_AMOUNT) : 0;

  return {
    subtotal,
    taxAmount,
    lineDiscountTotal,
    manualDiscount,
    couponDiscount,
    tierDiscount,
    orderDiscountTotal,
    totalBeforeLoyalty,
    roundOff,
    finalTotal,
    loyaltyDiscount,
    pointsRedeemed,
    amountDue,
    pointsEarned,
  };
}

export function loyaltyDiscountFromPoints(points: number): number {
  return round2(Math.max(0, points) * LOYALTY_POINT_VALUE);
}

export function loyaltyPointsEarned(amountDue: number): number {
  if (amountDue <= 0) return 0;
  return Math.floor(amountDue / LOYALTY_EARN_PER_AMOUNT);
}

/** Prefer weighed barcode price when present and >= 1. */
export function resolveUnitPrice(catalogPrice: number, scaleAsPrice?: number | null): number {
  if (scaleAsPrice != null && scaleAsPrice >= 1) return round2(scaleAsPrice);
  return round2(catalogPrice);
}
