/** Printed barcode tags append a 3-digit unit serial (001, 002, …) to variant barcode or SKU. */
export const PRINT_TAG_SERIAL_LEN = 3;

export interface PrintTagItemRef {
  sku: string;
  variant?: {
    barcode?: string | null;
    product?: { barcode?: string | null };
  } | null;
}

/** Base code encoded on printed tags (before the 3-digit unit serial). */
export function printTagBaseCode(item: PrintTagItemRef): string {
  return (
    item.variant?.barcode?.trim() ||
    item.variant?.product?.barcode?.trim() ||
    item.sku?.trim() ||
    ""
  );
}

/** Full scannable value on a printed tag for a given unit serial (1-based). */
export function printTagBarcodeValue(baseCode: string, serial: number): string {
  const base = baseCode.replace(/[^\x20-\x7E]/g, "").trim();
  if (!base || serial < 1) return "";
  return `${base}${serial.toString().padStart(PRINT_TAG_SERIAL_LEN, "0")}`;
}

export function sanitizeBarcodeText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").trim().slice(0, 40);
}

export function normalizeBarcodeKey(value: string): string {
  return sanitizeBarcodeText(value);
}

function barcodeKeysEqual(a: string, b: string): boolean {
  return normalizeBarcodeKey(a).toLowerCase() === normalizeBarcodeKey(b).toLowerCase();
}

/** Build lookup keys for a scanned / typed code (full tag + base without serial). */
export function barcodeLookupCandidates(code: string): string[] {
  const raw = normalizeBarcodeKey(code);
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  if (raw.length > PRINT_TAG_SERIAL_LEN && /\d{3}$/.test(raw)) {
    keys.add(raw.slice(0, -PRINT_TAG_SERIAL_LEN));
  }
  return [...keys];
}

/** True when input is probably a scanner wedge rather than a name search. */
export function isLikelyBarcodeScan(code: string): boolean {
  const t = normalizeBarcodeKey(code);
  if (!t) return false;
  if (/\s/.test(t)) return false;
  if (/^\d{4,}$/.test(t)) return true;
  if (/^[A-Z0-9._-]{3,}$/i.test(t) && /\d/.test(t)) return true;
  if (/^[A-Z0-9._-]{5,}$/i.test(t)) return true;
  return false;
}

export interface BarcodeProductRef {
  variantId?: string;
  barcode?: string;
  sku: string;
  stock?: number;
}

function matchesBarcodeKey(product: BarcodeProductRef, key: string): boolean {
  if (product.barcode && barcodeKeysEqual(product.barcode, key)) return true;
  if (product.sku && product.sku.toLowerCase() === key.toLowerCase()) return true;
  return false;
}

/** All variant rows matching a scanned code (product-level or variant-level barcode / SKU). */
export function findAllProductsByBarcodeCode<T extends BarcodeProductRef>(
  code: string,
  products: T[],
): T[] {
  const matches = new Map<string, T>();
  for (const key of barcodeLookupCandidates(code)) {
    for (const p of products) {
      if (matchesBarcodeKey(p, key)) {
        matches.set(p.variantId ?? `${p.sku}:${p.barcode ?? ""}`, p);
      }
    }
  }
  return [...matches.values()];
}

function pickBestBarcodeMatch<T extends BarcodeProductRef>(matches: T[]): T | undefined {
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  const inStock = matches.filter((p) => (p.stock ?? 0) > 0);
  const pool = inStock.length > 0 ? inStock : matches;
  return pool.sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0];
}

/** Find best variant row from cached POS products for a scanned code. */
export function findProductByBarcodeCode<T extends BarcodeProductRef>(
  code: string,
  products: T[],
): T | undefined {
  return pickBestBarcodeMatch(findAllProductsByBarcodeCode(code, products));
}

export function matchesCachedBarcode(code: string, products: BarcodeProductRef[]): boolean {
  return !!findProductByBarcodeCode(code, products);
}
