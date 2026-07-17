/** POS totals — mirrors apps/api/src/modules/pos/pos.module.ts createSale math */

export interface PosLineInput {
  unitPrice: number;
  quantity: number;
  discountAmount?: number;
  discountType?: "percentage" | "fixed";
  taxRate?: number;
}

function lineDiscount(lineTotal: number, discount: number, type?: string) {
  if (type === "percentage") return (lineTotal * discount) / 100;
  return discount;
}

export function calcPosLineDiscount(item: PosLineInput) {
  const lineTotal = item.unitPrice * item.quantity;
  return lineDiscount(lineTotal, item.discountAmount ?? 0, item.discountType);
}

export function calcPosLineNet(item: PosLineInput) {
  const lineTotal = item.unitPrice * item.quantity;
  return lineTotal - calcPosLineDiscount(item);
}

export function calcPosSubtotal(items: PosLineInput[]) {
  return items.reduce((sum, item) => {
    const lineTotal = item.unitPrice * item.quantity;
    return sum + lineTotal - lineDiscount(lineTotal, item.discountAmount ?? 0, item.discountType);
  }, 0);
}

/** When posTaxRate is set, all lines use that rate (POS Settings master control). */
export function calcPosTaxAmount(items: PosLineInput[], posTaxRate?: number) {
  return items.reduce((sum, item) => {
    const lineTotal = item.unitPrice * item.quantity;
    const disc = lineDiscount(lineTotal, item.discountAmount ?? 0, item.discountType);
    const taxable = lineTotal - disc;
    const rate = posTaxRate !== undefined ? posTaxRate : (item.taxRate ?? 0);
    return sum + (taxable * rate) / 100;
  }, 0);
}

export function calcPosAmountDue(
  items: PosLineInput[],
  opts?: {
    manualDiscount?: number;
    manualDiscountType?: "percentage" | "fixed";
    couponDiscount?: number;
    tierDiscount?: number;
    loyaltyPoints?: number;
    /** POS Settings tax rate — overrides per-line product tax when provided. */
    posTaxRate?: number;
  },
) {
  const subtotal = calcPosSubtotal(items);
  const taxAmount = calcPosTaxAmount(items, opts?.posTaxRate);

  let manualDiscount = 0;
  if (opts?.manualDiscountType === "percentage") {
    manualDiscount = (subtotal * (opts.manualDiscount ?? 0)) / 100;
  } else {
    manualDiscount = opts?.manualDiscount ?? 0;
  }

  const couponDiscount = opts?.couponDiscount ?? 0;
  const tierDiscount = opts?.tierDiscount ?? 0;
  const totalDiscount = manualDiscount + couponDiscount + tierDiscount;
  const total = subtotal + taxAmount - totalDiscount;
  const finalTotal = total + (Math.round(total) - total);
  const loyaltyDiscount = (opts?.loyaltyPoints ?? 0) * 0.1;
  return Math.max(0, finalTotal - loyaltyDiscount);
}

export const TIER_DISCOUNT_PCT: Record<string, number> = {
  BRONZE: 0,
  SILVER: 3,
  GOLD: 5,
  PLATINUM: 8,
  DIAMOND: 10,
  bronze: 0,
  silver: 3,
  gold: 5,
  platinum: 8,
  diamond: 10,
};

export function calcTierDiscount(subtotal: number, tier?: string | null) {
  const pct = tier ? (TIER_DISCOUNT_PCT[tier] ?? 0) : 0;
  if (pct <= 0) return 0;
  return Math.round((subtotal * pct) / 100 * 100) / 100;
}
