/**
 * Which products may be sold in fractions (audit P-F16).
 *
 * The web decides this in `apps/web/src/lib/pos-weight.ts` (`isPosWeightedProduct`): a product is fractional-capable
 * when it is WEIGHTED, when `allowDecimalSelling` is on, or when its unit is a weight unit. The API now applies the
 * SAME rule, so it refuses exactly the fractions the screen already prevents (a crafted request can no longer sell
 * 0.5 of a bottle) and never refuses a sale the screen allows (a kg product whose flag still has the column default
 * `false` keeps selling by weight).
 */
const WEIGHT_UNITS = ['kg', 'g', 'gram', 'grams', 'kilogram', 'kilograms'];

export type FractionRuleProduct = {
  productKind?: string | null;
  unit?: string | null;
  allowDecimalSelling?: boolean | null;
};

export function productAllowsFractions(p: FractionRuleProduct): boolean {
  if (p.productKind === 'WEIGHTED') return true;
  if (p.allowDecimalSelling) return true;
  return WEIGHT_UNITS.includes((p.unit ?? '').trim().toLowerCase());
}

/** True when the quantity is a whole number (tolerates float noise such as 2.0000000001). */
export function isWholeQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && Math.abs(quantity - Math.round(quantity)) < 1e-9;
}

/** Error message when `quantity` is a fraction of a product that is sold in whole units, else null. */
export function fractionalQuantityRejection(name: string, quantity: number, product: FractionRuleProduct): string | null {
  if (productAllowsFractions(product) || isWholeQuantity(quantity)) return null;
  return `${name} is sold in whole units; quantity ${quantity} is not allowed.`;
}
