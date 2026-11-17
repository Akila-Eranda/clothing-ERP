import { adjustRequestFingerprint, decideAdjustReplay } from './inventory-idempotency.helper';

const base = { variantId: 'v1', quantity: 5, movementType: 'ADJUSTMENT', warehouseId: 'w1', batchNumber: 'B1', unitCost: 10 };

describe('adjustRequestFingerprint', () => {
  it('is stable for the same payload and changes with anything that changes stock', () => {
    expect(adjustRequestFingerprint(base)).toBe(adjustRequestFingerprint({ ...base, batchNumber: ' B1 ', quantity: 5.0004 }));
    expect(adjustRequestFingerprint(base)).not.toBe(adjustRequestFingerprint({ ...base, quantity: 6 }));
    expect(adjustRequestFingerprint(base)).not.toBe(adjustRequestFingerprint({ ...base, variantId: 'v2' }));
    expect(adjustRequestFingerprint(base)).not.toBe(adjustRequestFingerprint({ ...base, movementType: 'DAMAGE' }));
    expect(adjustRequestFingerprint(base)).not.toBe(adjustRequestFingerprint({ ...base, warehouseId: 'w2' }));
  });
});

describe('decideAdjustReplay', () => {
  const fp = adjustRequestFingerprint(base);
  const existing = { variantId: 'v1', branchId: 'b1', requestFingerprint: fp };
  it('replays the same payload', () => {
    expect(decideAdjustReplay(existing, { variantId: 'v1', branchId: 'b1', fingerprint: fp }).kind).toBe('REPLAY');
  });
  it('conflicts on a different payload, variant or branch', () => {
    const other = adjustRequestFingerprint({ ...base, quantity: 9 });
    expect(decideAdjustReplay(existing, { variantId: 'v1', branchId: 'b1', fingerprint: other }).kind).toBe('CONFLICT');
    expect(decideAdjustReplay(existing, { variantId: 'v2', branchId: 'b1', fingerprint: fp }).kind).toBe('CONFLICT');
    expect(decideAdjustReplay(existing, { variantId: 'v1', branchId: 'b2', fingerprint: fp }).kind).toBe('CONFLICT');
  });
});
