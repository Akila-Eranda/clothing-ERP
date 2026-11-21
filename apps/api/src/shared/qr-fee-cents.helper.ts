/**
 * QR fee computed in INTEGER CENTS (proposed replacement for the arithmetic inside `computeQrFee` in
 * `qr-fee.helper.ts`; NOT wired anywhere yet).
 *
 * Why: `computeQrFee` rounds `gross × percent / 100` as a float. Exact half-cent fees are often represented a hair
 * below .5 (e.g. 5,039 × 1.5 % = 75.585 → stored as 75.58499…), so they round DOWN to 75.58 instead of half-up to
 * 75.59. The POS screen uses the same float code, so the two sides still agree (no 409), but the stored fee can be
 * one cent below what the bank deducts. Here gross and percent are converted to integer cents / basis points first
 * (both are validated to at most 2 decimals), so the half-up rounding is exact.
 *
 * Same rule as `computeQrFee`: fee only when gross is ABOVE the threshold, fee on the WHOLE gross, net = gross − fee.
 * Pure function, no Prisma.
 */
import type { QrFeeResult, QrFeeSettings } from './qr-fee.helper';

const toCents = (n: number) => Math.round(n * 100);

export function computeQrFeeCents(amount: number, settings: QrFeeSettings): QrFeeResult {
  const grossCents = Number.isFinite(amount) && amount > 0 ? toCents(amount) : 0;
  const gross = grossCents / 100;
  const bp = Number.isFinite(settings.percent) && settings.percent > 0 ? toCents(settings.percent) : 0; // basis points
  if (bp > 0 && gross > settings.threshold) {
    // fee in cents = grossCents × bp / 10,000, half-up. grossCents ≤ 1e10 and bp ≤ 2,000 keep this an exact integer.
    const feeCents = Math.floor((grossCents * bp + 5000) / 10000);
    return { amount: gross, feePercent: settings.percent, feeAmount: feeCents / 100, netAmount: (grossCents - feeCents) / 100 };
  }
  return { amount: gross, feePercent: 0, feeAmount: 0, netAmount: gross };
}
