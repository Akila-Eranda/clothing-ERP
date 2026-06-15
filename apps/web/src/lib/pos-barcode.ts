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

/** Build lookup keys for a scanned / typed code (full tag + base without serial). */
export function barcodeLookupCandidates(code: string): string[] {
  const raw = code.trim();
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  if (raw.length > PRINT_TAG_SERIAL_LEN && /\d{3}$/.test(raw)) {
    keys.add(raw.slice(0, -PRINT_TAG_SERIAL_LEN));
  }
  return [...keys];
}

/** True when input is probably a scanner wedge rather than a name search. */
export function isLikelyBarcodeScan(code: string): boolean {
  const t = code.trim();
  if (!t) return false;
  if (/^\d{8,}$/.test(t)) return true;
  if (/^[A-Z0-9-]{6,}$/i.test(t) && /\d/.test(t)) return true;
  return false;
}

export interface BarcodeProductRef {
  variantId?: string;
  barcode?: string;
  sku: string;
}

/** Find exact variant row from cached POS products for a scanned code. */
export function findProductByBarcodeCode<T extends BarcodeProductRef>(
  code: string,
  products: T[],
): T | undefined {
  for (const key of barcodeLookupCandidates(code)) {
    const byBarcode = products.find((p) => p.barcode && p.barcode === key);
    if (byBarcode) return byBarcode;
    const bySku = products.find((p) => p.sku.toLowerCase() === key.toLowerCase());
    if (bySku) return bySku;
  }
  return undefined;
}

export function matchesCachedBarcode(code: string, products: BarcodeProductRef[]): boolean {
  return !!findProductByBarcodeCode(code, products);
}
