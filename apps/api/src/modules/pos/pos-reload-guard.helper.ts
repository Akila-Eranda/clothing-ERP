/**
 * Reload / recharge lines and the POS price guard (audit P-F1).
 *
 * In the reload design a reload line is always a bill-only (custom) line: the web reload panel and Quick Pay
 * send `isCustom: true` with a `custom-reload-…` id and the operator / denomination, and the ReloadSale ledger
 * is written from those fields. No catalog product is a reload product (there is no such flag in the schema).
 *
 * So a CATALOG line (a real variantId) that carries `reloadType` is not a reload: it is a request to skip the
 * price guard for an ordinary product. It is refused instead of being priced silently.
 */

export type SaleLineReloadFields = {
  variantId?: string | null;
  isCustom?: boolean | null;
  reloadType?: string | null;
};

/** Same rule createSale uses everywhere: no catalog id, an explicit flag, or a `custom-` id = bill-only line. */
export function isCustomSaleLine(item: SaleLineReloadFields): boolean {
  const id = item.variantId?.trim() ?? '';
  return !!item.isCustom || !id || id.startsWith('custom-');
}

export function customLineNeedsManager(item: SaleLineReloadFields & { reloadType?: string | null }): boolean {
  return isCustomSaleLine(item) && !item.reloadType;
}

export function catalogCustomLineRejection(item: SaleLineReloadFields): string | null {
  const id = item.variantId?.trim() ?? '';
  if (item.isCustom && id && !id.startsWith('custom-')) {
    return 'A catalog variant cannot be submitted as a custom bill item.';
  }
  return null;
}

/**
 * Error message when a catalog line asks to be treated as a reload line, else null.
 * Custom lines are never refused here (they are not price-guarded, and the reload ledger validates the
 * operator / denomination itself).
 */
export function catalogReloadLineRejection(item: SaleLineReloadFields & { productName?: string | null; sku?: string | null }): string | null {
  if (isCustomSaleLine(item)) return null;
  if (!item.reloadType) return null;
  const label = item.productName?.trim() || item.sku || item.variantId;
  return `${label}: a catalog product cannot be sold as a reload / recharge line. Add reloads from the Reload panel.`;
}

/**
 * P-F21: a reload / recharge-card line sells a whole number of units (each unit is its own ReloadSale row; a
 * physical card has its own PIN). Tolerates float noise (2.0000000001) but never a real fraction (2.5).
 */
export function isWholeReloadQuantity(quantity: unknown): boolean {
  const q = Number(quantity);
  return Number.isFinite(q) && q >= 1 && Math.abs(q - Math.round(q)) < 1e-9;
}
