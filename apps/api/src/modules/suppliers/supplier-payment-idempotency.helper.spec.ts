import { isSupplierPaymentReplay, supplierPaymentRequestFingerprint } from './supplier-payment-idempotency.helper';

describe('supplier payment idempotency', () => {
  const request = {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    amount: 1250,
    method: 'CASH',
    purchaseIds: ['po-2', 'po-1', 'po-1'],
    allowAdvance: false,
  };

  it('is stable for equivalent purchase selections', () => {
    expect(supplierPaymentRequestFingerprint(request)).toBe(
      supplierPaymentRequestFingerprint({ ...request, purchaseIds: ['po-1', 'po-2'] }),
    );
  });

  it('detects changed payment payloads', () => {
    const fingerprint = supplierPaymentRequestFingerprint(request);
    expect(isSupplierPaymentReplay(fingerprint, supplierPaymentRequestFingerprint({ ...request, amount: 1251 }))).toBe('CONFLICT');
    expect(isSupplierPaymentReplay(fingerprint, fingerprint)).toBe('REPLAY');
  });

  it('keeps equivalent request keys isolated by tenant', () => {
    expect(supplierPaymentRequestFingerprint(request)).not.toBe(
      supplierPaymentRequestFingerprint({ ...request, tenantId: 'tenant-2' }),
    );
  });
});
