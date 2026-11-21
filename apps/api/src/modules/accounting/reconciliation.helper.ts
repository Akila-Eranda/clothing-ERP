/**
 * Full accounting reconciliation - PURE helpers (no database, no Nest DI).
 *
 * Read-only by design: every function only compares two numbers that come from two independent sources and
 * reports the difference. Nothing here writes, posts or "fixes" anything; history is never adjusted.
 * Tolerance is 0.01 (one cent) - rounding noise only, never a real difference.
 */

export const RECON_TOLERANCE = 0.01;

export type ReconStatus = 'OK' | 'MISMATCH' | 'NOT_CHECKED' | 'DECISION_REQUIRED';

export type ReconSide = {
  /** Human label of the figure, e.g. "Sum of customer wallet balances". */
  label: string;
  /** Where the number comes from (table / report) so a reviewer can re-run it. */
  source: string;
  value: number | null;
};

export type ReconCheck = {
  key: string;
  title: string;
  a: ReconSide;
  b: ReconSide;
  /** a - b, rounded to cents; null when a side is not available. */
  difference: number | null;
  status: ReconStatus;
  /** Explanation or open accounting question. Never an automatic correction. */
  note?: string;
};

export const toCents = (n: number) => Math.round(Number(n) * 100);
export const fromCents = (cents: number) => cents / 100;
export const roundCents = (n: number) => fromCents(toCents(n));

/** Sum monetary values as integer cents to avoid binary floating-point accumulation. */
export function sumCents(values: number[]): number {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0));
}

export type JournalReference = { referenceType: string | null; referenceId: string | null };

export function duplicateReferences(rows: JournalReference[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.referenceType || !row.referenceId) continue;
    const key = `${row.referenceType}:${row.referenceId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key).sort();
}

export function missingReferences(
  expected: { referenceType: string; referenceId: string }[],
  posted: JournalReference[],
): string[] {
  const postedKeys = new Set(
    posted
      .filter((row): row is { referenceType: string; referenceId: string } => Boolean(row.referenceType && row.referenceId))
      .map((row) => `${row.referenceType}:${row.referenceId}`),
  );
  return expected
    .map((row) => `${row.referenceType}:${row.referenceId}`)
    .filter((key) => !postedKeys.has(key))
    .sort();
}

export function withinTolerance(a: number, b: number, tolerance = RECON_TOLERANCE): boolean {
  return Math.abs(roundCents(a) - roundCents(b)) <= tolerance + 1e-9;
}

/**
 * Compare two sources. A missing side gives NOT_CHECKED (never a silent OK). `decisionNote` marks a known
 * accounting question: a difference is then reported as DECISION_REQUIRED instead of MISMATCH, so nobody
 * "fixes" a number whose correct treatment the owner has not decided yet.
 */
export function compareSources(
  key: string,
  title: string,
  a: ReconSide,
  b: ReconSide,
  opts: { tolerance?: number; note?: string; decisionNote?: string } = {},
): ReconCheck {
  if (a.value == null || b.value == null || !Number.isFinite(a.value) || !Number.isFinite(b.value)) {
    return { key, title, a, b, difference: null, status: 'NOT_CHECKED', note: opts.note ?? 'A source was not available' };
  }
  const difference = roundCents(a.value - b.value);
  const ok = withinTolerance(a.value, b.value, opts.tolerance);
  if (ok) return { key, title, a, b, difference, status: 'OK', note: opts.note };
  if (opts.decisionNote) return { key, title, a, b, difference, status: 'DECISION_REQUIRED', note: opts.decisionNote };
  return { key, title, a, b, difference, status: 'MISMATCH', note: opts.note };
}

/** A check that cannot run yet (missing data or an undecided rule) - reported, never skipped silently. */
export function notChecked(key: string, title: string, a: ReconSide, b: ReconSide, note: string): ReconCheck {
  return { key, title, a, b, difference: null, status: 'NOT_CHECKED', note };
}

export type AccountSide = 'DEBIT' | 'CREDIT';

/** Net GL balance of a set of accounts in their normal direction, from per-account debit/credit totals. */
export function glBalance(
  totals: { accountId: string; debit: number; credit: number }[],
  accountIds: string[],
  normal: AccountSide,
): number {
  const ids = new Set(accountIds);
  let debit = 0;
  let credit = 0;
  for (const t of totals) {
    if (!ids.has(t.accountId)) continue;
    debit += toCents(t.debit);
    credit += toCents(t.credit);
  }
  return fromCents(normal === 'DEBIT' ? debit - credit : credit - debit);
}

/** Per-account debit/credit totals from journal lines (a line may debit one account and/or credit another). */
export function totalsByAccount(
  lines: { debitAccountId?: string | null; creditAccountId?: string | null; amount: number }[],
): { accountId: string; debit: number; credit: number }[] {
  const m = new Map<string, { accountId: string; debit: number; credit: number }>();
  const row = (id: string) => {
    let r = m.get(id);
    if (!r) {
      r = { accountId: id, debit: 0, credit: 0 };
      m.set(id, r);
    }
    return r;
  };
  for (const l of lines) {
    if (l.debitAccountId) row(l.debitAccountId).debit += toCents(l.amount);
    if (l.creditAccountId) row(l.creditAccountId).credit += toCents(l.amount);
  }
  return [...m.values()].map((r) => ({ ...r, debit: fromCents(r.debit), credit: fromCents(r.credit) }));
}

/** Journal entries whose debits and credits differ (should be none). */
export function unbalancedEntries(
  lines: { journalEntryId: string; debitAccountId?: string | null; creditAccountId?: string | null; amount: number }[],
  tolerance = RECON_TOLERANCE,
): { journalEntryId: string; debit: number; credit: number; difference: number }[] {
  const m = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const r = m.get(l.journalEntryId) ?? { debit: 0, credit: 0 };
    if (l.debitAccountId) r.debit += l.amount;
    if (l.creditAccountId) r.credit += l.amount;
    m.set(l.journalEntryId, r);
  }
  const out: { journalEntryId: string; debit: number; credit: number; difference: number }[] = [];
  for (const [journalEntryId, r] of m) {
    if (!withinTolerance(r.debit, r.credit, tolerance)) {
      out.push({ journalEntryId, debit: roundCents(r.debit), credit: roundCents(r.credit), difference: roundCents(r.debit - r.credit) });
    }
  }
  return out;
}

/** Trial balance from stored account balances: total debit-normal vs total credit-normal. */
export function trialBalanceTotals(accounts: { type: string; balance: number }[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const a of accounts) {
    const debitNormal = a.type === 'ASSET' || a.type === 'EXPENSE';
    const signed = debitNormal ? a.balance : -a.balance; // + = debit side
    if (signed >= 0) debit += signed;
    else credit += -signed;
  }
  return { debit: roundCents(debit), credit: roundCents(credit) };
}

/** Stored Account.balance vs the balance the journal lines add up to (drift = a posting bypassed the GL). */
export function accountBalanceDrift(
  accounts: { id: string; code: string; type: string; balance: number; openingBalance?: number }[],
  totals: { accountId: string; debit: number; credit: number }[],
  tolerance = RECON_TOLERANCE,
): { accountId: string; code: string; stored: number; fromJournal: number; difference: number }[] {
  const byId = new Map(totals.map((t) => [t.accountId, t]));
  const out: { accountId: string; code: string; stored: number; fromJournal: number; difference: number }[] = [];
  for (const a of accounts) {
    const t = byId.get(a.id) ?? { debit: 0, credit: 0 };
    const debitNormal = a.type === 'ASSET' || a.type === 'EXPENSE';
    const fromJournal = roundCents((a.openingBalance ?? 0) + (debitNormal ? t.debit - t.credit : t.credit - t.debit));
    if (!withinTolerance(a.balance, fromJournal, tolerance)) {
      out.push({ accountId: a.id, code: a.code, stored: roundCents(a.balance), fromJournal, difference: roundCents(a.balance - fromJournal) });
    }
  }
  return out;
}

/** Quantity ledger check: Inventory.quantity vs sum of the stock-movement ledger per variant. */
export function stockLedgerDrift(
  onHand: { variantId: string; quantity: number }[],
  ledger: { variantId: string; quantityChange: number }[],
  tolerance = 0.0005,
): { variantId: string; onHand: number; ledger: number; difference: number }[] {
  const sums = new Map<string, number>();
  for (const l of ledger) sums.set(l.variantId, (sums.get(l.variantId) ?? 0) + l.quantityChange);
  const q = new Map<string, number>();
  for (const o of onHand) q.set(o.variantId, (q.get(o.variantId) ?? 0) + o.quantity);
  const ids = new Set([...q.keys(), ...sums.keys()]);
  const out: { variantId: string; onHand: number; ledger: number; difference: number }[] = [];
  for (const variantId of ids) {
    const a = q.get(variantId) ?? 0;
    const b = sums.get(variantId) ?? 0;
    if (Math.abs(a - b) > tolerance) {
      out.push({ variantId, onHand: Math.round(a * 1000) / 1000, ledger: Math.round(b * 1000) / 1000, difference: Math.round((a - b) * 1000) / 1000 });
    }
  }
  return out;
}

/** Inventory valuation from stock rows (quantity x average cost, negative stock counts as zero value). */
export function inventoryValuation(rows: { quantity: number; avgCost: number }[]): number {
  return roundCents(rows.reduce((s, r) => s + Math.max(0, r.quantity) * Math.max(0, r.avgCost), 0));
}

export type ReconSummary = { total: number; ok: number; mismatch: number; notChecked: number; decisionRequired: number; clean: boolean };

export function summarizeChecks(checks: ReconCheck[]): ReconSummary {
  const count = (s: ReconStatus) => checks.filter((c) => c.status === s).length;
  const mismatch = count('MISMATCH');
  const decisionRequired = count('DECISION_REQUIRED');
  return {
    total: checks.length,
    ok: count('OK'),
    mismatch,
    notChecked: count('NOT_CHECKED'),
    decisionRequired,
    clean: mismatch === 0 && decisionRequired === 0,
  };
}
