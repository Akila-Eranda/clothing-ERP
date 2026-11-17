import { isReturnRequestConflict, returnRequestFingerprint } from './return-idempotency.helper';

describe('return idempotency', () => {
  const input = {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    originalSaleId: 'sale-1',
    reason: 'CUSTOMER_REQUEST',
    items: [{ variantId: 'v-1', quantity: 1 }],
  };

  it('produces the same fingerprint when item ordering changes', () => {
    expect(returnRequestFingerprint({
      ...input,
      items: [{ variantId: 'v-2', quantity: 2 }, ...input.items],
    })).toBe(returnRequestFingerprint({
      ...input,
      items: [...input.items, { variantId: 'v-2', quantity: 2 }],
    }));
  });

  it('detects a reused key with a different payload', () => {
    const fingerprint = returnRequestFingerprint(input);
    expect(isReturnRequestConflict(fingerprint, returnRequestFingerprint({ ...input, originalSaleId: 'sale-2' }))).toBe(true);
    expect(isReturnRequestConflict(fingerprint, fingerprint)).toBe(false);
  });
});
