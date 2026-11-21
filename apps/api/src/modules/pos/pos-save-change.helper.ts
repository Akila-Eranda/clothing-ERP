/**
 * POS "save change to customer account" + wallet debit guard — pure helpers (no Prisma, no Nest DI).
 *
 * Example: bill LKR 129, customer hands over LKR 200 cash → change 71. With the customer's explicit consent the
 * cashier keeps the 71 (or part of it) on the customer's wallet (store credit, Customer.walletBalance) instead of
 * handing it back. Next bill LKR 20 paid with WALLET leaves 51.
 *
 * Shop settings (tenant.settings.pos): saveChangeToWalletEnabled (default false — opt-in, see the report:
 * the GL posting for saved change is pending approval), saveChangeMin / saveChangeMax (LKR, optional).
 */

export type SaveChangeSettings = {
  enabled: boolean;
  /** Smallest amount that may be saved (0 = any positive amount). */
  min: number;
  /** Largest amount that may be saved per sale (null = no cap besides the change itself). */
  max: number | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function resolveSaveChangeSettings(tenantSettings: unknown): SaveChangeSettings {
  const pos = ((tenantSettings as Record<string, unknown> | null)?.['pos'] ?? {}) as Record<string, unknown>;
  const min = num(pos['saveChangeMin']);
  const max = num(pos['saveChangeMax']);
  return {
    enabled: pos['saveChangeToWalletEnabled'] === true,
    min: min != null && min >= 0 ? r2(min) : 0,
    max: max != null && max > 0 ? r2(max) : null,
  };
}

export type SaveChangeInput = {
  /** Amount the cashier asked to keep on the customer's account (undefined / 0 = none). */
  requested?: number | null;
  /** The customer agreed (ticked on the POS). Must be exactly true. */
  consent?: boolean | null;
  customerId?: string | null;
  /** Server-computed change for this sale. */
  changeDue: number;
  /** Cash tendered on this sale (change is only kept from cash). */
  cashPaid: number;
  /** Bill not fully paid (balance charged to credit). */
  isPartial: boolean;
  /** CUSTOMER_CREDIT tender on this sale. */
  creditPayTotal: number;
  settings: SaveChangeSettings;
};

export type SaveChangeDecision = { ok: true; amount: number } | { ok: false; reason: string };

/** How much of the change goes to the customer's wallet, or why the request is refused. */
export function decideSaveChange(input: SaveChangeInput): SaveChangeDecision {
  // Fail closed: NaN slips through every `>` / `<` guard below, so any non-finite figure refuses the request.
  const figures = [input.changeDue, input.cashPaid, input.creditPayTotal];
  if (input.requested != null) figures.push(input.requested);
  if (!figures.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return { ok: false, reason: 'Change cannot be saved: the sale amounts are not valid numbers' };
  }
  const requested = r2(input.requested ?? 0);
  if (requested <= 0) return { ok: true, amount: 0 };
  if (!input.settings.enabled) {
    return { ok: false, reason: 'Saving change to the customer account is not enabled for this shop' };
  }
  if (input.consent !== true) {
    return { ok: false, reason: 'Customer consent is required to save change to the customer account' };
  }
  if (!input.customerId) {
    return { ok: false, reason: 'Select a customer to save change to their account' };
  }
  if (input.isPartial || input.creditPayTotal > 0.009) {
    return { ok: false, reason: 'Change cannot be saved on a partial or credit sale' };
  }
  const change = r2(Math.max(0, input.changeDue));
  if (change <= 0) return { ok: false, reason: 'This sale has no change to save' };
  if (requested > change + 0.001) {
    return { ok: false, reason: `Only the change (LKR ${change.toFixed(2)}) can be saved to the customer account` };
  }
  if (requested > r2(Math.max(0, input.cashPaid)) + 0.001) {
    return { ok: false, reason: 'Only change from a cash payment can be saved to the customer account' };
  }
  if (input.settings.min > 0 && requested + 0.001 < input.settings.min) {
    return { ok: false, reason: `The smallest amount that can be saved is LKR ${input.settings.min.toFixed(2)}` };
  }
  if (input.settings.max != null && requested > input.settings.max + 0.001) {
    return { ok: false, reason: `At most LKR ${input.settings.max.toFixed(2)} can be saved per sale` };
  }
  return { ok: true, amount: Math.min(requested, change) };
}

/**
 * Lower bound for the guarded wallet debit (`walletBalance >= floor`). Balances are stored as Float, so a
 * balance of 51 may read 50.99999999999: a tolerance far below one cent absorbs that dust without ever letting
 * a debit exceed the balance by a real amount.
 *
 * Throws for a non-finite amount or one that rounds to <= 0: such a floor would be NaN (matches nothing in JS but
 * is undefined in a DB filter) or slightly negative (lets a zero / negative "debit" through any balance). Throwing
 * rather than returning Infinity keeps a bogus value out of a Prisma `gte` filter; callers must validate first.
 */
export function walletDebitFloor(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || r2(amount) <= 0) {
    throw new Error(`walletDebitFloor: debit amount must be a finite number of at least 0.01 (got ${amount})`);
  }
  return r2(amount) - 0.000001;
}
