/** POS sale idempotency — pure helpers for clientRequestId replay (no Nest DI). */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

/** UUIDs, nanoids, ULIDs: 8–64 chars of [A-Za-z0-9_-]. */
export const CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function normalizeClientRequestId(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export type SaleFingerprintInput = {
  customerId?: string | null;
  items: Array<{
    variantId?: string | null;
    productName?: string | null;
    quantity: number;
    unitPrice: number;
    discount?: number | null;
    discountType?: string | null;
  }>;
  payments: Array<{ method: string; amount: number; reference?: string | null; cardLast4?: string | null; qrCodeId?: string | null }>;
  discountAmount?: number | null;
  couponCode?: string | null;
  loyaltyPointsToRedeem?: number | null;
};

const n3 = (v: number | null | undefined) => Math.round((v ?? 0) * 1000) / 1000;

/**
 * Stable hash of what the cashier is charging for. A retry of the same checkout produces the
 * same fingerprint; reusing a key for a different cart does not. Order-insensitive.
 */
export function saleRequestFingerprint(input: SaleFingerprintInput): string {
  const items = input.items
    .map((i) => [
      i.variantId?.trim() || `custom:${i.productName?.trim() ?? ''}`,
      n3(i.quantity),
      n3(i.unitPrice),
      n3(i.discount),
      (i.discountType ?? 'FIXED').toUpperCase(),
    ].join('|'))
    .sort();
  const payments = input.payments
    // cardLast4 / qrCodeId only when present, so fingerprints of older requests stay identical.
    .map((p) => [
      p.method, n3(p.amount), p.reference?.trim() ?? '',
      ...(p.cardLast4?.trim() ? [`c4:${p.cardLast4.trim()}`] : []),
      ...(p.qrCodeId?.trim() ? [`qr:${p.qrCodeId.trim()}`] : []),
    ].join('|'))
    .sort();
  const canonical = JSON.stringify({
    c: input.customerId ?? null,
    i: items,
    p: payments,
    d: n3(input.discountAmount),
    k: input.couponCode?.trim().toUpperCase() || null,
    l: n3(input.loyaltyPointsToRedeem),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** True when a Prisma error is the (tenantId, clientRequestId) unique violation. */
export function isClientRequestIdConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((f) => f.includes('clientRequestId'));
}

export type ReplayDecision =
  | { kind: 'REPLAY' }
  | { kind: 'CONFLICT'; reason: string };

/** Decide whether an existing sale with the same key may be returned for this request. */
export function decideSaleReplay(
  existing: { branchId: string; cashierId: string | null; metadata: unknown },
  request: { branchId: string; cashierId: string; fingerprint: string },
): ReplayDecision {
  if (existing.branchId !== request.branchId) {
    return { kind: 'CONFLICT', reason: 'clientRequestId was already used by another branch' };
  }
  if (existing.cashierId && existing.cashierId !== request.cashierId) {
    return { kind: 'CONFLICT', reason: 'clientRequestId was already used by another cashier' };
  }
  const stored = (existing.metadata as { requestFingerprint?: string } | null)?.requestFingerprint;
  if (stored && stored !== request.fingerprint) {
    return { kind: 'CONFLICT', reason: 'clientRequestId was already used for a different cart' };
  }
  return { kind: 'REPLAY' };
}
