/**
 * QR payment fee — Option A (confirmed 12 Nov): the fee is DEDUCTED from the QR payment by the bank.
 *
 * The customer pays the QR amount (part of the invoice, never more); the invoice total is unchanged.
 * When that QR amount is ABOVE the threshold, the bank keeps `percent` % of the WHOLE amount:
 *   fee = gross × percent / 100      net received = gross − fee
 * Defaults: LKR 5,000 and 1 %. Worked out per QR tender (each QR payment is one bank transaction).
 *
 * Settings live in `tenant.settings.pos.qrFeeThreshold` / `qrFeePercent` (Settings → POS, admin only).
 * The computed values are stored with each QR payment (sale_payments.amount = gross, feePercent, feeAmount,
 * netAmount) and are never recomputed, so changing the settings never changes a past sale, refund or report.
 * Accounting: Dr Bank & QR Payment Charges (expense) fee / Cr bank fee — the bank ends with the net amount.
 * Pure functions (no Prisma) so they are unit-tested.
 */

export const DEFAULT_QR_FEE_THRESHOLD = 5000;
export const DEFAULT_QR_FEE_PERCENT = 1;
/** Safety limits for the settings (a typo such as 100 % or LKR 1e12 must not be savable). */
export const MAX_QR_FEE_PERCENT = 20;
export const MAX_QR_FEE_THRESHOLD = 100_000_000;

export type QrFeeSettings = { threshold: number; percent: number };

export type QrFeeResult = {
  /** Gross QR amount the customer pays (settles that part of the invoice). */
  amount: number;
  /** Percentage applied (0 when no fee applies). */
  feePercent: number;
  /** Deducted by the bank. */
  feeAmount: number;
  /** What the business receives: amount − fee. */
  netAmount: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const hasAtMost2Decimals = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Settings of a shop; a missing or invalid stored value falls back to the default. */
export function resolveQrFeeSettings(tenantSettings: unknown): QrFeeSettings {
  const pos = ((tenantSettings as Record<string, unknown> | null)?.['pos'] ?? {}) as Record<string, unknown>;
  const t = num(pos['qrFeeThreshold']);
  const p = num(pos['qrFeePercent']);
  return {
    threshold: t != null && t >= 0 && t <= MAX_QR_FEE_THRESHOLD ? t : DEFAULT_QR_FEE_THRESHOLD,
    percent: p != null && p >= 0 && p <= MAX_QR_FEE_PERCENT ? p : DEFAULT_QR_FEE_PERCENT,
  };
}

/** Why these settings cannot be saved, or null. Both values are required together with the checks below. */
export function qrFeeSettingsError(input: { threshold?: unknown; percent?: unknown }): string | null {
  if (input.threshold !== undefined) {
    const t = num(input.threshold);
    if (t == null) return 'QR fee threshold must be a number';
    if (t < 0) return 'QR fee threshold cannot be negative';
    if (t > MAX_QR_FEE_THRESHOLD) return `QR fee threshold cannot be above LKR ${MAX_QR_FEE_THRESHOLD.toLocaleString('en-US')}`;
    if (!hasAtMost2Decimals(t)) return 'QR fee threshold can have at most 2 decimal places';
  }
  if (input.percent !== undefined) {
    const p = num(input.percent);
    if (p == null) return 'QR fee percentage must be a number';
    if (p < 0) return 'QR fee percentage cannot be negative';
    if (p > MAX_QR_FEE_PERCENT) return `QR fee percentage cannot be above ${MAX_QR_FEE_PERCENT}%`;
    if (!hasAtMost2Decimals(p)) return 'QR fee percentage can have at most 2 decimal places';
  }
  return null;
}

/** The fee deducted from one QR payment (gross). Only amounts ABOVE the threshold have a fee. */
export function computeQrFee(amount: number, settings: QrFeeSettings): QrFeeResult {
  const a = r2(Number.isFinite(amount) && amount > 0 ? amount : 0);
  if (a > settings.threshold && settings.percent > 0) {
    const fee = r2((a * settings.percent) / 100);
    return { amount: a, feePercent: settings.percent, feeAmount: fee, netAmount: r2(a - fee) };
  }
  return { amount: a, feePercent: 0, feeAmount: 0, netAmount: a };
}
