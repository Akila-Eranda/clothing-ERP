/** POS helpers for weighted / scale products sold by gram entry. */

export type PosWeightProduct = {
  productKind?: string | null;
  unit?: string | null;
  allowDecimalSelling?: boolean | null;
  weightScaleReady?: boolean | null;
};

export function isPosWeightedProduct(p?: PosWeightProduct | null): boolean {
  if (!p) return false;
  if (p.productKind === "WEIGHTED") return true;
  if (p.allowDecimalSelling) return true;
  const u = (p.unit ?? "").trim().toLowerCase();
  return u === "kg" || u === "g" || u === "gram" || u === "grams";
}

/** Product catalog unit is kilograms (price typically per kg). */
export function isPosKgUnit(p?: PosWeightProduct | null): boolean {
  const u = (p?.unit ?? "").trim().toLowerCase();
  if (u === "g" || u === "gram" || u === "grams") return false;
  if (u === "kg" || u === "kilogram" || u === "kilograms") return true;
  // Weighted with no unit → treat as kg (grocery default)
  return isPosWeightedProduct(p);
}

/** Convert grams typed by cashier → cart quantity in product unit (kg or g). */
export function gramsToCartQty(grams: number, p?: PosWeightProduct | null): number {
  const g = Math.max(0, grams);
  if (!isPosKgUnit(p)) return Math.round(g * 1000) / 1000; // already grams as qty
  return Math.round((g / 1000) * 1000) / 1000; // kg with 3 decimals
}

/** Cart quantity → grams for display / edit. */
export function cartQtyToGrams(qty: number, p?: PosWeightProduct | null): number {
  const q = Math.max(0, qty);
  if (!isPosKgUnit(p)) return Math.round(q);
  return Math.round(q * 1000);
}

export function formatPosWeightQty(qty: number, p?: PosWeightProduct | null): string {
  if (!isPosWeightedProduct(p)) {
    return String(qty);
  }
  const grams = cartQtyToGrams(qty, p);
  if (isPosKgUnit(p) && grams >= 1000 && grams % 1000 === 0) {
    return `${grams / 1000} kg`;
  }
  return `${grams} g`;
}

export function parseGramsInput(raw: string): number {
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}
