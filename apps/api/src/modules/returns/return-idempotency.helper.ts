import { createHash } from 'crypto';

type ReturnItemInput = { variantId: string; quantity: number };

export function returnRequestFingerprint(input: {
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  reason: string;
  returnType?: string;
  notes?: string;
  restockItems?: boolean;
  items: ReturnItemInput[];
  exchangeItems?: ReturnItemInput[];
  exchangePayments?: { method: string; amount: number; cardLast4?: string; bankAccountId?: string }[];
  exchangeExcessAs?: string;
}): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    branchId: input.branchId,
    originalSaleId: input.originalSaleId,
    reason: input.reason,
    returnType: input.returnType ?? 'RETURN',
    notes: input.notes?.trim() || null,
    restockItems: input.restockItems !== false,
    items: input.items.map(({ variantId, quantity }) => ({ variantId, quantity })).sort((a, b) => a.variantId.localeCompare(b.variantId)),
    exchangeItems: (input.exchangeItems ?? []).map(({ variantId, quantity }) => ({ variantId, quantity })).sort((a, b) => a.variantId.localeCompare(b.variantId)),
    exchangePayments: (input.exchangePayments ?? []).map((p) => ({
      method: p.method,
      amount: Math.round(p.amount * 100) / 100,
      cardLast4: p.cardLast4 ?? null,
      bankAccountId: p.bankAccountId ?? null,
    })),
    exchangeExcessAs: input.exchangeExcessAs ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isReturnRequestConflict(
  storedFingerprint: string | null | undefined,
  requestFingerprint: string,
): boolean {
  return Boolean(storedFingerprint && storedFingerprint !== requestFingerprint);
}
