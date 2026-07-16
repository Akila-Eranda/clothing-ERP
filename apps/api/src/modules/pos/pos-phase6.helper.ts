/** Pure POS Phase 6 helpers — unit-tested for high-speed checkout math. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Helper commission = sale amount × rate%. */
export function computeHelperCommission(saleAmount: number, commissionRatePct: number): number {
  if (saleAmount <= 0 || commissionRatePct <= 0) return 0;
  return round2((saleAmount * commissionRatePct) / 100);
}

export type GiftVoucherRedeemResult =
  | { ok: true; applied: number; remainingBalance: number; status: 'ACTIVE' | 'PARTIALLY_USED' | 'REDEEMED' }
  | { ok: false; reason: string };

/** Apply gift voucher against amount due (partial redeem supported). */
export function applyGiftVoucherRedeem(
  balance: number,
  amountDue: number,
  requestedAmount?: number,
): GiftVoucherRedeemResult {
  if (balance <= 0) return { ok: false, reason: 'Voucher has no remaining balance' };
  if (amountDue <= 0) return { ok: false, reason: 'Nothing due to redeem against' };
  const want = requestedAmount != null && requestedAmount > 0
    ? Math.min(requestedAmount, amountDue, balance)
    : Math.min(amountDue, balance);
  const applied = round2(want);
  if (applied <= 0) return { ok: false, reason: 'Invalid redeem amount' };
  const remainingBalance = round2(balance - applied);
  const status =
    remainingBalance <= 0.009 ? 'REDEEMED' : remainingBalance < balance ? 'PARTIALLY_USED' : 'ACTIVE';
  return { ok: true, applied, remainingBalance: Math.max(0, remainingBalance), status };
}

/** Generate a short printable voucher code (tenant-safe alphanumeric). */
export function generateGiftVoucherCode(prefix = 'GV'): string {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  const part2 = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${part}${part2}`;
}

/** Clamp cart quantity for high-speed scan stacking. */
export function stackCartQuantity(currentQty: number, addQty: number, stock: number): number {
  const next = Math.max(0, currentQty) + Math.max(1, addQty || 1);
  return Math.min(next, Math.max(0, stock));
}

/** Simulated high-speed scan throughput: ms budget per scan cycle. */
export function scanCycleBudgetMs(scansPerSecond: number): number {
  if (scansPerSecond <= 0) return Infinity;
  return Math.floor(1000 / scansPerSecond);
}
