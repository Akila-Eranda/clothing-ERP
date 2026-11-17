import { round2 } from '@/modules/pricing/pricing.helper';

export type ParsedScaleBarcode = {
  code: string;
  pluKeys: string[];
  embeddedValue: number;
  asPrice: number;
  asWeightKg: number;
};

export function parseScaleBarcode(value: string): ParsedScaleBarcode | null {
  const code = value.trim();
  if (!/^2\d{12}$/.test(code)) return null;

  const digits = code.slice(0, 12).split('').map(Number);
  const checksum = digits.reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0);
  if ((10 - (checksum % 10)) % 10 !== Number(code[12])) return null;

  const embeddedValue = Number(code.slice(7, 12));
  return {
    code,
    pluKeys: [code.slice(2, 7), code.slice(1, 7), code.slice(0, 7)],
    embeddedValue,
    asPrice: embeddedValue / 100,
    asWeightKg: embeddedValue / 1000,
  };
}

/**
 * How a shop's label scale encodes the 5-digit value in digits 8-12 (audit P-F3). Supermarkets differ, so it is a
 * per-shop setting (`tenant.settings.pos.scaleBarcodeMode`, Settings -> POS):
 *   AUTO   (default when unset - today's behaviour, unchanged): a value >= LKR 1.00 is read as a PRICE, otherwise as a
 *          WEIGHT. Ambiguous for weight labels of 1 kg and more (value 01000+ grams reads as LKR 10.00+).
 *   PRICE  the value is always a price in cents.
 *   WEIGHT the value is always grams.
 */
export type ScaleBarcodeMode = 'AUTO' | 'PRICE' | 'WEIGHT';
export const SCALE_BARCODE_MODES: readonly ScaleBarcodeMode[] = ['AUTO', 'PRICE', 'WEIGHT'];

/** The configured mode; anything missing or unknown keeps the existing AUTO behaviour. */
export function resolveScaleBarcodeMode(tenantSettings: unknown): ScaleBarcodeMode {
  const pos = (tenantSettings as { pos?: Record<string, unknown> } | null | undefined)?.pos;
  const raw = typeof pos?.scaleBarcodeMode === 'string' ? pos.scaleBarcodeMode.trim().toUpperCase() : '';
  return (SCALE_BARCODE_MODES as readonly string[]).includes(raw) ? (raw as ScaleBarcodeMode) : 'AUTO';
}

export function scaleBarcodeQuantity(scale: ParsedScaleBarcode, unitPrice: number, mode: ScaleBarcodeMode = 'AUTO'): number | null {
  if (!(unitPrice > 0)) return null;
  const asPrice = mode === 'PRICE' ? scale.asPrice > 0 : mode === 'WEIGHT' ? false : scale.asPrice >= 1;
  const quantity = asPrice ? scale.asPrice / unitPrice : scale.asWeightKg;
  const rounded = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
  if (asPrice && Math.abs(round2(rounded * unitPrice) - round2(scale.asPrice)) > 0.01) {
    return null;
  }
  return rounded >= 0.001 ? rounded : null;
}

export function scaleBarcodeMatchesKnownKeys(scale: ParsedScaleBarcode, knownKeys: string[]): boolean {
  const keys = new Set(knownKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  return scale.pluKeys.some((key) => keys.has(key.toLowerCase()));
}

export function sameScaleQuantity(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.0005;
}

export function sameScalePrice(actual: number, expected: number): boolean {
  return Math.abs(Math.round(round2(actual) * 100) - Math.round(round2(expected) * 100)) <= 1;
}
