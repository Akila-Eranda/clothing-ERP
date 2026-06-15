/** POS terminal settings persisted in localStorage (per device). */

export const POS_TAX_RATE_KEY = "pos_tax_rate";

export function readPosTaxRate(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(POS_TAX_RATE_KEY);
  if (raw === null) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function writePosTaxRate(rate: number): number {
  const v = Math.min(100, Math.max(0, rate));
  if (typeof window !== "undefined") {
    localStorage.setItem(POS_TAX_RATE_KEY, String(v));
  }
  return v;
}
