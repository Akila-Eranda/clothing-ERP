import { createHash } from 'crypto';

export type SupplierPaymentRequest = {
  tenantId: string;
  branchId?: string | null;
  amount: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  invoiceId?: string | null;
  purchaseId?: string | null;
  purchaseIds?: string[] | null;
  paidAt?: string | null;
  chequeNumber?: string | null;
  chequeDueDate?: string | null;
  chequeBankName?: string | null;
  chequeBankAccountId?: string | null;
  bankAccountId?: string | null;
  allowAdvance?: boolean | null;
};

const n2 = (value: number | null | undefined) => Math.round((value ?? 0) * 100) / 100;
const text = (value: string | null | undefined) => value?.trim() || null;

/** Hashes every request field that can change the supplier payment or its cash movement. */
export function supplierPaymentRequestFingerprint(input: SupplierPaymentRequest): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    branchId: text(input.branchId),
    amount: n2(input.amount),
    method: text(input.method)?.toUpperCase() ?? null,
    reference: text(input.reference),
    notes: text(input.notes),
    invoiceId: text(input.invoiceId),
    purchaseId: text(input.purchaseId),
    purchaseIds: [...new Set(input.purchaseIds ?? [])].sort(),
    paidAt: text(input.paidAt),
    chequeNumber: text(input.chequeNumber),
    chequeDueDate: text(input.chequeDueDate),
    chequeBankName: text(input.chequeBankName),
    chequeBankAccountId: text(input.chequeBankAccountId),
    bankAccountId: text(input.bankAccountId),
    allowAdvance: input.allowAdvance === true,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function isSupplierPaymentReplay(
  storedFingerprint: string | null | undefined,
  requestFingerprint: string,
): 'REPLAY' | 'CONFLICT' {
  return storedFingerprint && storedFingerprint !== requestFingerprint ? 'CONFLICT' : 'REPLAY';
}
