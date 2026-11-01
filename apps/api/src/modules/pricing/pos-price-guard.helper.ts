/** POS price guard — server-side checks on cashier-entered unit prices (pure, no Nest DI). */

import { RoleType } from '@prisma/client';
import { CartLineInput, lineDiscountAmount, round2 } from './pricing.helper';

/** Tolerance for float / rounding noise between client and server prices. */
export const PRICE_TOLERANCE = 0.01;

/** Roles allowed to sell above the highest known price or below cost. */
export const PRICE_OVERRIDE_ROLES: string[] = [
  RoleType.SUPER_ADMIN,
  RoleType.TENANT_ADMIN,
  RoleType.BRANCH_MANAGER,
];

export function canOverridePosPrice(roles: string[]): boolean {
  return roles.some((r) => PRICE_OVERRIDE_ROLES.includes(r));
}

export type PosCatalogPriceContext = {
  /** Every legitimate selling price: variant / product selling + wholesale, PO selling prices. */
  knownPrices: number[];
  /** Highest MRP on variant / product / PO lines (0 = none). */
  mrp: number;
  /** Server-side unit cost (0 = unknown → no below-cost check). */
  costPrice: number;
  /**
   * Weighed goods: price-embedded scale barcodes send the whole line value as unitPrice
   * with qty 1, so per-unit price/cost rules cannot be applied.
   */
  isWeighted: boolean;
};

export type PosPriceViolation = {
  kind: 'ABOVE_MAX_PRICE' | 'BELOW_COST';
  unitPrice: number;
  limit: number;
};

/** Highest price the line may carry without an override (max of MRP and known prices). */
export function maxAllowedUnitPrice(ctx: PosCatalogPriceContext): number {
  const prices = [ctx.mrp, ...ctx.knownPrices].filter((p) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.max(...prices) : 0;
}

/**
 * Lowest net price a cashier may sell at: cost, or the lowest catalog/PO price when the shop
 * deliberately prices below cost (clearance). 0 = no floor.
 */
export function minAllowedUnitPrice(ctx: PosCatalogPriceContext): number {
  if (!(ctx.costPrice > 0)) return 0;
  const known = ctx.knownPrices.filter((p) => Number.isFinite(p) && p > 0);
  return known.length ? Math.min(ctx.costPrice, ...known) : ctx.costPrice;
}

/** Net unit price after the line discount. */
export function netUnitPrice(line: CartLineInput): number {
  if (!(line.quantity > 0)) return 0;
  const lineTotal = round2(line.unitPrice * line.quantity);
  const discount = lineDiscountAmount(lineTotal, line.discount, line.discountType);
  return round2((lineTotal - discount) / line.quantity);
}

/** Returns the rule the line breaks, or null when the price is acceptable. */
export function findPosPriceViolation(
  line: CartLineInput,
  ctx: PosCatalogPriceContext,
): PosPriceViolation | null {
  if (ctx.isWeighted) return null;

  const max = maxAllowedUnitPrice(ctx);
  if (max > 0 && line.unitPrice > max + PRICE_TOLERANCE) {
    return { kind: 'ABOVE_MAX_PRICE', unitPrice: round2(line.unitPrice), limit: round2(max) };
  }

  const min = minAllowedUnitPrice(ctx);
  const net = netUnitPrice(line);
  if (min > 0 && net < min - PRICE_TOLERANCE) {
    return { kind: 'BELOW_COST', unitPrice: net, limit: round2(min) };
  }

  return null;
}

export function describePosPriceViolation(label: string, v: PosPriceViolation): string {
  if (v.kind === 'ABOVE_MAX_PRICE') {
    return `${label}: price LKR ${v.unitPrice.toFixed(2)} is above the allowed maximum LKR ${v.limit.toFixed(2)} (MRP / selling price). Manager approval required.`;
  }
  return `${label}: net price LKR ${v.unitPrice.toFixed(2)} is below cost LKR ${v.limit.toFixed(2)} (minimum allowed). Manager approval required.`;
}
