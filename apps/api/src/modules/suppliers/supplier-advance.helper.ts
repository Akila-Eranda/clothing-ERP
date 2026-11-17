/**
 * Supplier advance (overpayment kept on account) - pure planning rules, no database.
 *
 * - A payment above what is payable may keep the EXCESS as the supplier's advance, only when the caller asks
 *   for it (`allowAdvance`); otherwise the old rule stays: payment above the payable is refused.
 * - An advance is applied to open bills (PO dues / invoices): partially, over several bills, never above the
 *   available advance and never above what a bill still owes.
 * All amounts are rounded to cents; the service re-checks everything under a row lock.
 */
import { createHash } from 'crypto';
import { allocateApPaymentFifo, roundAp, type SupplierApLine } from './supplier-ap.helper';

export type AdvanceError = { code: 'BAD_REQUEST'; message: string };
export class AdvanceRuleError extends Error {
  readonly code = 'BAD_REQUEST' as const;
}

const EPS = 0.01;

/** How a payment of `amount` against `due` payable splits into settled payables and kept advance. */
export function splitPaymentForAdvance(amount: number, due: number, allowAdvance: boolean): { applied: number; advance: number } {
  const pay = roundAp(amount);
  const owed = roundAp(Math.max(0, due));
  if (!(pay > 0)) throw new AdvanceRuleError('Amount must be positive');
  if (pay <= owed + EPS) return { applied: Math.min(pay, owed), advance: 0 };
  if (!allowAdvance) {
    throw new AdvanceRuleError(`Payment exceeds outstanding (LKR ${owed.toFixed(2)}). Tick "keep the excess as supplier advance" to overpay.`);
  }
  return { applied: owed, advance: roundAp(pay - owed) };
}

export type AdvanceRequest = {
  /** Explicit per-bill amounts. */
  allocations?: { purchaseId?: string; invoiceId?: string; amount: number }[];
  /** Or one total, spread oldest-first (optionally only over these POs). */
  amount?: number;
  purchaseIds?: string[];
};

export type AdvancePlanLine = { lineId: string; source: 'PO' | 'INVOICE'; applied: number };

/** Which bills an advance application pays, validated against the open bills and the available advance. */
export function planAdvanceApplication(lines: SupplierApLine[], request: AdvanceRequest, advanceBalance: number): { allocations: AdvancePlanLine[]; total: number } {
  const available = roundAp(Math.max(0, advanceBalance));
  let allocations: AdvancePlanLine[] = [];

  if (request.allocations?.length) {
    const seen = new Set<string>();
    for (const a of request.allocations) {
      const amount = roundAp(a.amount);
      if (!Number.isFinite(a.amount) || !(amount > 0)) throw new AdvanceRuleError('Each amount must be greater than zero');
      const hasPo = !!a.purchaseId?.trim();
      const hasInv = !!a.invoiceId?.trim();
      if (hasPo === hasInv) throw new AdvanceRuleError('Each line needs exactly one of purchaseId or invoiceId');
      const source = hasInv ? 'INVOICE' : 'PO';
      const lineId = (hasInv ? a.invoiceId : a.purchaseId)!.trim();
      const key = `${source}:${lineId}`;
      if (seen.has(key)) throw new AdvanceRuleError('The same bill is listed twice');
      seen.add(key);
      const line = lines.find((l) => l.id === lineId && l.source === source);
      if (!line) throw new AdvanceRuleError(`Bill is not open for this supplier: ${lineId}`);
      if (amount > line.amount + EPS) throw new AdvanceRuleError(`Amount LKR ${amount.toFixed(2)} is above what ${line.docNumber} still owes (LKR ${line.amount.toFixed(2)})`);
      allocations.push({ lineId, source, applied: Math.min(amount, line.amount) });
    }
  } else {
    const amount = roundAp(request.amount ?? 0);
    if (!(amount > 0)) throw new AdvanceRuleError('Enter the amount of advance to apply');
    const scoped = request.purchaseIds?.length ? lines.filter((l) => l.source === 'PO' && request.purchaseIds!.includes(l.id)) : lines;
    const open = roundAp(scoped.reduce((s, l) => s + l.amount, 0));
    if (open <= EPS) throw new AdvanceRuleError('No open bill to apply the advance to');
    if (amount > open + EPS) throw new AdvanceRuleError(`Amount is above the open bills (LKR ${open.toFixed(2)})`);
    allocations = allocateApPaymentFifo(scoped, amount);
  }

  const total = roundAp(allocations.reduce((s, a) => s + a.applied, 0));
  if (!(total > 0)) throw new AdvanceRuleError('Nothing to apply');
  if (total > available + EPS) throw new AdvanceRuleError(`Not enough advance: available LKR ${available.toFixed(2)}, requested LKR ${total.toFixed(2)}`);
  return { allocations, total };
}

/** Stable hash of WHAT an advance application asks for (notes excluded). Order-insensitive. */
export function advanceRequestFingerprint(request: AdvanceRequest): string {
  const c2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const canonical = request.allocations?.length
    ? {
        a: request.allocations
          .map((x) => `${x.invoiceId?.trim() ? 'I' : 'P'}:${(x.invoiceId?.trim() || x.purchaseId?.trim() || '')}:${c2(x.amount)}`)
          .sort(),
      }
    : { t: c2(request.amount ?? 0), po: [...new Set((request.purchaseIds ?? []).map((i) => i.trim()))].sort() };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Same key: a stored fingerprint must match; rows written before fingerprints existed (null) replay. */
export function decideAdvanceReplay(storedFingerprint: string | null | undefined, requestFingerprint: string): 'REPLAY' | 'CONFLICT' {
  return storedFingerprint && storedFingerprint !== requestFingerprint ? 'CONFLICT' : 'REPLAY';
}
