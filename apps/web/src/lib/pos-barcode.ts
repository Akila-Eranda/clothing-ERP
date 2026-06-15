/** Printed barcode tags append a 3-digit unit serial (001, 002, …) to variant barcode or SKU. */
export const PRINT_TAG_SERIAL_LEN = 3;

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
