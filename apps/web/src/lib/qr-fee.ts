/**
 * QR payment fee, as shown to the CASHIER before confirming (same rule as the API,
 * apps/api/src/shared/qr-fee.helper.ts; the API is the authority and refuses the sale when its figure differs
 * from the one sent in `expectedQrFee`).
 *
 * Option A (confirmed): the fee is DEDUCTED from the QR payment by the bank. The customer pays the QR amount
 * (gross, part of the invoice — never more); the shop receives net = gross − fee. Fee = percent % of the WHOLE
 * QR amount, only when that amount is ABOVE the threshold, worked out per QR tender.
 */
export const DEFAULT_QR_FEE_THRESHOLD = 5000;
export const DEFAULT_QR_FEE_PERCENT = 1;

export type QrFeeSettings = { threshold: number; percent: number };
export type QrFee = { amount: number; feePercent: number; feeAmount: number; netAmount: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toCents = (n: number) => Math.round(n * 100);

/** Settings from the POS tenant settings (missing / invalid values fall back to the defaults). */
export function qrFeeSettingsOf(s: { qrFeeThreshold?: number | null; qrFeePercent?: number | null } | null | undefined): QrFeeSettings {
  const t = Number(s?.qrFeeThreshold);
  const p = Number(s?.qrFeePercent);
  return {
    threshold: Number.isFinite(t) && t >= 0 ? t : DEFAULT_QR_FEE_THRESHOLD,
    percent: Number.isFinite(p) && p >= 0 ? p : DEFAULT_QR_FEE_PERCENT,
  };
}

export function computeQrFee(amount: number, settings: QrFeeSettings): QrFee {
  const grossCents = Number.isFinite(amount) && amount > 0 ? toCents(amount) : 0;
  const a = grossCents / 100;
  const percentBasisPoints = Number.isFinite(settings.percent) && settings.percent > 0 ? toCents(settings.percent) : 0;
  if (a > settings.threshold && percentBasisPoints > 0) {
    const feeCents = Math.floor((grossCents * percentBasisPoints + 5000) / 10000);
    return {
      amount: a,
      feePercent: settings.percent,
      feeAmount: feeCents / 100,
      netAmount: (grossCents - feeCents) / 100,
    };
  }
  return { amount: a, feePercent: 0, feeAmount: 0, netAmount: a };
}

/** Total over several QR tenders (split payment): fee per tender, never on the total. */
export function totalQrFee(amounts: number[], settings: QrFeeSettings): { fee: number; amount: number; netAmount: number } {
  const parts = amounts.map((a) => computeQrFee(a, settings));
  return {
    fee: r2(parts.reduce((s, p) => s + p.feeAmount, 0)),
    amount: r2(parts.reduce((s, p) => s + p.amount, 0)),
    netAmount: r2(parts.reduce((s, p) => s + p.netAmount, 0)),
  };
}
