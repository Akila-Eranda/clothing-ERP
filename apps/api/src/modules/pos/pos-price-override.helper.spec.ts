import { annotateOverrides, buildMrpOverrideAudit, mrpOverrides, priceOverrideReasonError } from './pos-price-override.helper';

const above = { variantId: 'v1', unitPrice: 130, limit: 120, kind: 'ABOVE_MAX_PRICE' };
const below = { variantId: 'v2', unitPrice: 50, limit: 80, kind: 'BELOW_COST' };

describe('pos-price-override.helper (MRP override audit)', () => {
  it('only above-maximum overrides need a reason; below-cost overrides keep their existing behaviour', () => {
    expect(priceOverrideReasonError([below], undefined)).toBeNull();
    expect(priceOverrideReasonError([], '')).toBeNull();
    expect(priceOverrideReasonError([above], undefined)).toMatch(/needs a reason/);
    expect(priceOverrideReasonError([above, below], '   ')).toMatch(/needs a reason/);
    expect(priceOverrideReasonError([above], 'x'.repeat(301))).toMatch(/too long/);
    expect(priceOverrideReasonError([above], ' Customer asked for gift wrap ')).toBeNull();
  });

  it('annotates MRP overrides with who and why, and leaves other overrides exactly as they were', () => {
    const out = annotateOverrides([above, below], 'u1', '  clearance label wrong ');
    expect(out[0]).toEqual({ ...above, overriddenBy: 'u1', reason: 'clearance label wrong' });
    expect(out[1]).toEqual(below);
    expect(mrpOverrides([above, below])).toEqual([above]);
  });

  it('builds an audit record with user, reason and transaction details (MRP lines only)', () => {
    const audit = buildMrpOverrideAudit({
      tenantId: 't1', userId: 'u1', saleId: 's1', invoiceNumber: 'INV-1', branchId: 'b1', total: 130,
      reason: ' price tag error ', lines: [above, below], productNames: { v1: 'Milk' },
    });
    expect(audit).toMatchObject({ tenantId: 't1', userId: 'u1', action: 'APPROVE', resource: 'SalePriceOverride', resourceId: 's1' });
    expect(audit.newData).toEqual({
      kind: 'ABOVE_MAX_PRICE', invoiceNumber: 'INV-1', branchId: 'b1', saleTotal: 130, reason: 'price tag error',
      lines: [{ variantId: 'v1', product: 'Milk', unitPrice: 130, maximumPrice: 120 }],
    });
  });
});
