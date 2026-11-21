/**
 * Opening float rules for POST /cash/open (a NEW cash wallet / shift).
 *
 * The float is what the cashier says is in the drawer before selling. A mistyped figure (an extra digit, a
 * card number, a phone number) becomes "expected cash" and is carried over to every later handover, so it is
 * checked on the server:
 *   - a finite number, not negative, at most 2 decimal places;
 *   - not above the maximum opening float of the branch, else of the shop, else DEFAULT_MAX_OPENING_FLOAT.
 * Counter HANDOVERS do not use the opening amount: the existing drawer balance is carried over unchanged
 * (legitimate balances are never capped or rewritten).
 *
 * Configuration: shop-wide `tenant.settings.pos.maxOpeningFloat` (Settings → POS), optional per-branch override
 * `branch.settings.maxOpeningFloat`. Pure functions (no Prisma) so they are unit-tested.
 */

/** Used when neither the branch nor the shop configured a maximum (LKR). */
export const DEFAULT_MAX_OPENING_FLOAT = 1_000_000;
/** Absolute sanity cap for any typed cash amount on these endpoints (LKR); no setting can exceed it. */
export const ABSOLUTE_MAX_CASH_AMOUNT = 100_000_000;

const positive = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, ABSOLUTE_MAX_CASH_AMOUNT) : null;
};

export type OpeningFloatLimit = { max: number; source: 'BRANCH' | 'SHOP' | 'DEFAULT' };

export function resolveMaxOpeningFloat(tenantSettings: unknown, branchSettings: unknown): OpeningFloatLimit {
  const b = positive((branchSettings as Record<string, unknown> | null)?.['maxOpeningFloat']);
  if (b != null) return { max: b, source: 'BRANCH' };
  const pos = (tenantSettings as Record<string, unknown> | null)?.['pos'] as Record<string, unknown> | undefined;
  const t = positive(pos?.['maxOpeningFloat']);
  if (t != null) return { max: t, source: 'SHOP' };
  return { max: DEFAULT_MAX_OPENING_FLOAT, source: 'DEFAULT' };
}

/**
 * Sanity check of a COUNTED drawer amount (handover, wallet clear). The count is cash that already exists in the
 * drawer, so it is never capped below the recorded balance (legitimate balances stay usable); only an amount that
 * is both above ABSOLUTE_MAX_CASH_AMOUNT and more than twice the recorded balance is refused as a typing error.
 * Differences above the approval threshold still need a manager.
 */
export function countedCashError(counted: number, expected: number): string | null {
  if (!Number.isFinite(counted) || counted < 0) return 'Counted cash must be zero or more';
  if (!Number.isFinite(expected) || expected < 0) return 'Recorded cash balance is not a valid number';
  const ceiling = Math.max(ABSOLUTE_MAX_CASH_AMOUNT, Math.max(0, expected) * 2);
  if (counted > ceiling) return 'Counted cash is not a realistic amount: check the figure you typed';
  return null;
}

const lkr = (n: number) => `LKR ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Why an amount is not acceptable as an opening float, or null when it is. */
export function openingFloatError(amount: unknown, limit: OpeningFloatLimit): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Opening float must be a number';
  if (amount < 0) return 'Opening float cannot be negative';
  if (Math.abs(amount - Math.round(amount * 100) / 100) > 0.000001) return 'Opening float can have at most 2 decimal places';
  if (amount > limit.max) {
    const where = limit.source === 'BRANCH' ? 'this branch' : 'this shop';
    return `Opening float ${lkr(amount)} is above the maximum of ${lkr(limit.max)} for ${where}. Count the drawer again, or ask an admin to change the limit (Settings → POS).`;
  }
  return null;
}
