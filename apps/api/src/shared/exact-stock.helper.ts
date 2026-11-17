/**
 * Exact stock for purchasing (PO / GRN planning).
 *
 * Selling uses "available" stock clamped at 0. Purchasing must use the real figure: a variant oversold
 * to −2 needs 2 more units than one at 0, and "sold since last purchase" must count those 2.
 * Exact stock = on hand − reserved, never clamped. Pure function (no Prisma) so it is unit-tested.
 */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function exactStock(onHand: number | null | undefined, reserved?: number | null): number {
  const q = Number(onHand ?? 0);
  const r = Number(reserved ?? 0);
  return round3((Number.isFinite(q) ? q : 0) - (Number.isFinite(r) ? r : 0));
}

/** Exact stock of a POS product row (`currentStock` / `reservedStock`), falling back to `stock`. */
export function exactStockOfRow(row: { stock: number; currentStock?: unknown; reservedStock?: unknown }): number {
  if (typeof row.currentStock === 'number' && Number.isFinite(row.currentStock)) {
    return exactStock(row.currentStock, typeof row.reservedStock === 'number' ? row.reservedStock : 0);
  }
  return row.stock;
}

/** Exact stock summed over inventory rows (several warehouses / branches). */
export function sumExactStock(rows: Array<{ quantity?: number | null; reservedQty?: number | null }>): number {
  return round3(rows.reduce((s, r) => s + exactStock(r.quantity, r.reservedQty), 0));
}
