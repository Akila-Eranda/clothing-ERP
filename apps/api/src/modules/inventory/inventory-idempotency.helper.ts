/** Stock-adjustment idempotency - pure helpers (no Nest DI, no database). */
import { createHash } from 'crypto';

export type AdjustFingerprintInput = {
  warehouseId?: string | null;
  variantId: string;
  quantity: number;
  movementType: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  manufactureDate?: string | null;
  lotId?: string | null;
  unitCost?: number | null;
  referenceId?: string | null;
  referenceType?: string | null;
};

const n3 = (v: number | null | undefined) => Math.round((v ?? 0) * 1000) / 1000;
const day = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

/** Stable hash of WHAT the adjustment changes (notes excluded): a retry matches, a different payload does not. */
export function adjustRequestFingerprint(i: AdjustFingerprintInput): string {
  const canonical = JSON.stringify([
    i.warehouseId ?? '', i.variantId, n3(i.quantity), i.movementType, i.batchNumber?.trim() ?? '',
    day(i.expiryDate), day(i.manufactureDate), i.lotId ?? '', n3(i.unitCost), i.referenceId ?? '', i.referenceType ?? '',
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

export type AdjustReplayDecision = { kind: 'REPLAY' } | { kind: 'CONFLICT'; reason: string };

/** An earlier log row with the same key: same payload replays, anything else is a conflict. */
export function decideAdjustReplay(
  existing: { variantId: string; branchId: string; requestFingerprint: string | null },
  request: { variantId: string; branchId: string; fingerprint: string },
): AdjustReplayDecision {
  if (existing.variantId !== request.variantId || existing.branchId !== request.branchId) {
    return { kind: 'CONFLICT', reason: 'clientRequestId was already used for a different stock adjustment' };
  }
  if (existing.requestFingerprint && existing.requestFingerprint !== request.fingerprint) {
    return { kind: 'CONFLICT', reason: 'clientRequestId was already used for a different stock adjustment' };
  }
  return { kind: 'REPLAY' };
}
