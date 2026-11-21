import { CashMovementType, CashRegisterStatus } from '@prisma/client';
import { CASH_VARIANCE_APPROVAL_THRESHOLD, computeExpectedCashFromMovements } from './cash-register.helper';
import { HandoverPlan } from './cash-handover.helper';

/**
 * Cashier balance handover: pure policy checks layered on top of `planHandover` (cash-handover.helper).
 * No Prisma, no Nest: the service (cash-management.module.ts) is expected to call these inside its
 * handover / close transaction. Nothing here changes how money is booked.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.004;

// ── 1. Conservation: no cash created or lost by a handover ─────────────────────────────────────

/**
 * Invariants of a handover plan before anything is written:
 *  - every outgoing wallet hands over zero or more;
 *  - the per-wallet counts add up to what the incoming wallet opens with (no cash created / lost);
 *  - per-wallet variances add up to the total variance;
 *  - the incoming opening float equals the counted total.
 * Returns the list of violations (empty = consistent).
 */
export function handoverConservationErrors(plan: HandoverPlan, incomingOpeningCash: number): string[] {
  const errors: string[] = [];
  // Fail closed: NaN fails every `> EPS` comparison below and would read as "consistent".
  const nonFinite: string[] = [];
  const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!isNum(plan.countedTotal)) nonFinite.push('counted total');
  if (!isNum(plan.expectedTotal)) nonFinite.push('expected total');
  if (!isNum(plan.variance)) nonFinite.push('handover variance');
  for (const w of plan.wallets) {
    if (!isNum(w.counted) || !isNum(w.expected) || !isNum(w.variance)) nonFinite.push(`wallet ${w.id}`);
  }
  if (!isNum(incomingOpeningCash)) nonFinite.push('incoming opening float');
  if (nonFinite.length) return [`Handover figures are not valid numbers: ${nonFinite.join(', ')}`];
  if (plan.wallets.some((w) => w.counted < -EPS)) errors.push('A wallet cannot hand over a negative amount');
  const sumCounted = r2(plan.wallets.reduce((s, w) => s + w.counted, 0));
  const sumExpected = r2(plan.wallets.reduce((s, w) => s + w.expected, 0));
  const sumVariance = r2(plan.wallets.reduce((s, w) => s + w.variance, 0));
  if (Math.abs(sumCounted - plan.countedTotal) > EPS) errors.push(`Wallet counts (${sumCounted}) do not add up to the counted total (${plan.countedTotal})`);
  if (Math.abs(sumExpected - plan.expectedTotal) > EPS) errors.push(`Wallet balances (${sumExpected}) do not add up to the expected total (${plan.expectedTotal})`);
  if (Math.abs(sumVariance - plan.variance) > EPS) errors.push(`Wallet variances (${sumVariance}) do not add up to the handover variance (${plan.variance})`);
  if (Math.abs(r2(incomingOpeningCash) - plan.countedTotal) > EPS) {
    errors.push(`Incoming opening float (${r2(incomingOpeningCash)}) must equal the cash handed over (${plan.countedTotal})`);
  }
  return errors;
}

// ── 2. Variance: approval threshold and reason ─────────────────────────────────────────────────

export type HandoverVarianceWallet = {
  id: string;
  status: CashRegisterStatus;
  openingCash: number;
  movements: { type: CashMovementType; amount: number }[];
  /** Count at the outgoing cashier's own close (null when the wallet is still OPEN). */
  actualCash: number | null;
  /** A manager already approved this wallet's close variance (approveRegister). */
  closeVarianceApproved: boolean;
};

export type HandoverVarianceOptions = {
  threshold?: number;
  /**
   * HANDOVER_ONLY (current behaviour): only the difference against the drawer amount (the outgoing count for a
   * closed wallet) is checked. CUMULATIVE: the unapproved difference against the SYSTEM balance is checked, so a
   * close short of 400 followed by a handover short of 400 (800 in total) also needs a manager.
   */
  mode?: 'HANDOVER_ONLY' | 'CUMULATIVE';
  /** A reason is required when |variance| is above this (default 0 = any difference needs a reason). */
  reasonAbove?: number;
};

export type HandoverVarianceDecision = {
  /** counted − drawer amount (what the incoming cashier was told to expect). */
  handoverVariance: number;
  /** counted − system expected, summed over the wallets (close + handover differences). */
  systemVariance: number;
  /** Part of systemVariance not already approved by a manager at close. */
  unapprovedVariance: number;
  /** The figure compared with the threshold, per `mode`. */
  checkedVariance: number;
  needsApproval: boolean;
  reasonRequired: boolean;
  threshold: number;
};

/**
 * Whether a handover difference needs a manager and / or a written reason. The threshold is the existing
 * CASH_VARIANCE_APPROVAL_THRESHOLD (500, strictly greater than) unless overridden.
 */
export function evaluateHandoverVariance(
  wallets: HandoverVarianceWallet[],
  plan: HandoverPlan,
  opts: HandoverVarianceOptions = {},
): HandoverVarianceDecision {
  const threshold = opts.threshold ?? CASH_VARIANCE_APPROVAL_THRESHOLD;
  const mode = opts.mode ?? 'HANDOVER_ONLY';
  const reasonAbove = opts.reasonAbove ?? 0;
  let systemVariance = 0;
  let approvedAtClose = 0;
  for (const w of wallets) {
    const row = plan.wallets.find((p) => p.id === w.id);
    if (!row) throw new Error(`Wallet ${w.id} is not in the handover plan`);
    const systemExpected = computeExpectedCashFromMovements(w.openingCash, w.movements);
    systemVariance += row.counted - systemExpected;
    if (w.status !== CashRegisterStatus.OPEN && w.actualCash != null && w.closeVarianceApproved) {
      approvedAtClose += w.actualCash - systemExpected;
    }
  }
  systemVariance = r2(systemVariance);
  const unapprovedVariance = r2(systemVariance - approvedAtClose);
  const handoverVariance = r2(plan.variance);
  const checkedVariance = mode === 'CUMULATIVE' ? unapprovedVariance : handoverVariance;
  return {
    handoverVariance,
    systemVariance,
    unapprovedVariance,
    checkedVariance,
    needsApproval: Math.abs(checkedVariance) > threshold,
    reasonRequired: Math.abs(handoverVariance) > reasonAbove + EPS || Math.abs(checkedVariance) > reasonAbove + EPS,
    threshold,
  };
}

/** Error message for a handover that may not proceed, or null. */
export function handoverVarianceError(
  decision: HandoverVarianceDecision,
  input: { reason?: string | null; authorizerId?: string | null; performedById: string },
): string | null {
  if (decision.reasonRequired && !(input.reason ?? '').trim()) {
    // reasonRequired is set by |handoverVariance| or |checkedVariance| exceeding reasonAbove; the larger of the two
    // always exceeds it, so quote that one (in CUMULATIVE mode checkedVariance can be 0 while the handover is short).
    // Ties keep checkedVariance (identical in HANDOVER_ONLY mode).
    const quoted = Math.abs(decision.handoverVariance) > Math.abs(decision.checkedVariance)
      ? decision.handoverVariance
      : decision.checkedVariance;
    return `Counted cash differs by LKR ${quoted.toFixed(2)}. Enter a reason for the difference.`;
  }
  if (decision.needsApproval) {
    if (!input.authorizerId) {
      return `Counted cash differs by LKR ${decision.checkedVariance.toFixed(2)} (above LKR ${decision.threshold}). A manager must approve this handover with their PIN.`;
    }
    if (input.authorizerId === input.performedById) {
      return 'The manager approving a handover difference cannot be the cashier performing it.';
    }
  }
  return null;
}

// ── 3. Who may hand over / close ───────────────────────────────────────────────────────────────

export type CounterWalletState = {
  id: string;
  cashierId: string;
  status: CashRegisterStatus;
  clearedAt: Date | null;
  counterId: string | null;
};

/**
 * Wallets that must be carried into a new shift on a counter. Today only OTHER cashiers' uncleared wallets are
 * handed over; the incoming cashier's OWN closed-but-uncleared wallet on the same counter is left behind and a
 * fresh float is typed, which counts that drawer cash twice. `includeOwn` carries it over as well.
 */
export function walletsToCarryOver(
  wallets: CounterWalletState[],
  input: { counterId: string; incomingCashierId: string; includeOwn: boolean },
): { carry: CounterWalletState[]; blocked: CounterWalletState[] } {
  const onCounter = wallets.filter((w) => w.counterId === input.counterId && !w.clearedAt);
  const relevant = onCounter.filter((w) => input.includeOwn || w.cashierId !== input.incomingCashierId);
  // The incoming cashier's own OPEN wallet means "already working here" (handled by openRegister), not a handover.
  const carry = relevant.filter((w) => !(w.cashierId === input.incomingCashierId && w.status === CashRegisterStatus.OPEN));
  return {
    carry: carry.filter((w) => w.status !== CashRegisterStatus.PENDING_APPROVAL),
    blocked: carry.filter((w) => w.status === CashRegisterStatus.PENDING_APPROVAL),
  };
}

/**
 * Why a shift may not be closed now, or null. Closes only an OPEN, uncleared wallet: re-closing a
 * PENDING_APPROVAL wallet would overwrite the count under review (and could avoid the approval), and a wallet
 * already cleared by a handover / day-end clear must not get a second count.
 */
export function closeShiftBlocker(register: { status: CashRegisterStatus; clearedAt: Date | null }): string | null {
  if (register.clearedAt) return 'This shift was already handed over or cleared; it cannot be closed again';
  if (register.status === CashRegisterStatus.PENDING_APPROVAL) return 'This shift is waiting for manager approval of its variance';
  if (register.status !== CashRegisterStatus.OPEN) return 'Shift already closed';
  return null;
}

// ── 4. Idempotency of the handover request ─────────────────────────────────────────────────────

/**
 * A retried handover (double tap, network retry) finds the incoming cashier already holding an OPEN wallet on
 * the counter. If that wallet was opened by a handover of exactly the same outgoing wallets within the replay
 * window, return it instead of an error; anything else is a genuine conflict.
 */
export function handoverReplayDecision(
  existing: { registerId: string; openingTime: Date; handoverFromRegisterIds: string[]; countedCash: number } | null,
  request: { fromRegisterIds: string[]; countedCash?: number | null; now: Date; windowMs?: number },
): { kind: 'NEW' } | { kind: 'REPLAY'; registerId: string } | { kind: 'CONFLICT'; message: string } {
  if (!existing) return { kind: 'NEW' };
  const windowMs = request.windowMs ?? 2 * 60_000;
  const sameSet =
    existing.handoverFromRegisterIds.length > 0
    && [...existing.handoverFromRegisterIds].sort().join(',') === [...request.fromRegisterIds].sort().join(',');
  const sameCount = request.countedCash == null || Math.abs(r2(request.countedCash) - r2(existing.countedCash)) <= EPS;
  const recent = request.now.getTime() - existing.openingTime.getTime() <= windowMs;
  if (sameSet && sameCount && recent) return { kind: 'REPLAY', registerId: existing.registerId };
  return { kind: 'CONFLICT', message: 'You already have an open cash wallet on this counter. Continue with it.' };
}

// ── 5. Day-end view of handovers ───────────────────────────────────────────────────────────────

export type DayEndHandoverRow = {
  id: string;
  counterId: string;
  fromRegisterId: string;
  toRegisterId: string;
  expectedCash: number;
  countedCash: number;
  variance: number;
  counted: boolean;
  authorizedById: string | null;
  notes: string | null;
};

/**
 * What Day-End shows about handovers: the count, cash moved between shifts, the net difference, and the
 * exceptions a manager must look at (uncounted handovers, differences above the threshold without an approver,
 * differences without a reason). `openWallets` / `unclearedWallets` are the reasons the day is not finished.
 */
export function summarizeHandoversForDayEnd(
  rows: DayEndHandoverRow[],
  state: { openWallets: number; pendingApprovalWallets: number; unclearedWallets: number },
  threshold = CASH_VARIANCE_APPROVAL_THRESHOLD,
) {
  const shortages = r2(rows.filter((r) => r.variance < 0).reduce((s, r) => s + r.variance, 0));
  const overages = r2(rows.filter((r) => r.variance > 0).reduce((s, r) => s + r.variance, 0));
  const exceptions = rows
    .map((r) => {
      const why: string[] = [];
      if (!r.counted) why.push('NOT_COUNTED');
      if (Math.abs(r.variance) > threshold && !r.authorizedById) why.push('UNAPPROVED_VARIANCE');
      if (Math.abs(r.variance) > EPS && !(r.notes ?? '').trim()) why.push('NO_REASON');
      return { id: r.id, reasons: why };
    })
    .filter((e) => e.reasons.length);
  const blockers: string[] = [];
  if (state.openWallets) blockers.push(`${state.openWallets} shift(s) still open`);
  if (state.pendingApprovalWallets) blockers.push(`${state.pendingApprovalWallets} shift(s) waiting for variance approval`);
  if (state.unclearedWallets) blockers.push(`${state.unclearedWallets} closed wallet(s) not yet cleared to main cash`);
  return {
    handoverCount: rows.length,
    cashHandedOver: r2(rows.reduce((s, r) => s + r.countedCash, 0)),
    netVariance: r2(shortages + overages),
    shortages,
    overages,
    uncounted: rows.filter((r) => !r.counted).length,
    exceptions,
    blockers,
    dayComplete: blockers.length === 0,
  };
}
