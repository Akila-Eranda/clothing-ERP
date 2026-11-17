/**
 * Exact stock for purchasing screens (PO / GRN).
 *
 * The POS product API returns `stock` = available stock clamped at 0 (what can be sold), next to the
 * raw `currentStock` (on hand) and `reservedStock`. Purchasing must see the real figure: a variant
 * oversold to −2 needs 2 more units than one at 0. This returns on hand − reserved, not clamped,
 * and falls back to `stock` when the raw fields are missing.
 */
export interface StockFields {
  stock?: number | null;
  currentStock?: number | null;
  reservedStock?: number | null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function exactStock(v: StockFields | null | undefined): number {
  if (!v) return 0;
  const onHand = Number(v.currentStock);
  if (v.currentStock !== null && v.currentStock !== undefined && Number.isFinite(onHand)) {
    const reserved = Number(v.reservedStock ?? 0);
    return round(onHand - (Number.isFinite(reserved) ? reserved : 0));
  }
  const s = Number(v.stock ?? 0);
  return Number.isFinite(s) ? round(s) : 0;
}

/** Same row with `stock` and `availableStock` replaced by the exact (possibly negative) value. */
export function withExactStock<T extends StockFields & { availableStock?: number | null }>(v: T): T {
  const s = exactStock(v);
  return { ...v, stock: s, availableStock: s };
}
