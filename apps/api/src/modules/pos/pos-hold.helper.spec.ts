import { heldBillScopeWhere, holdBillDataRejection } from './pos-hold.helper';

describe('pos-hold.helper', () => {
  describe('holdBillDataRejection (P-F9 payload check)', () => {
    /** Shape the web cart store sends (getHoldPayload): items + customer + discount + notes + coupon. */
    const webPayload = {
      items: [
        { variantId: 'v-milk', productName: 'Milk', quantity: 2, unitPrice: 200, discountAmount: 0, discountType: 'fixed' },
        { variantId: 'v-rice', productName: 'Rice', quantity: 0.25, unitPrice: 400 },
        { variantId: 'custom-x1', productName: 'Bag', quantity: 1, unitPrice: 10, isCustom: true },
      ],
      customer: null,
      discount: 5,
      discountType: 'percentage',
      taxRate: 0,
      notes: '',
      couponCode: null,
      loyaltyPointsToRedeem: 0,
    };

    it('CONTROL: accepts the web cart payload unchanged (incl. decimal kg and custom lines)', () => {
      expect(holdBillDataRejection(webPayload)).toBeNull();
    });
    it('CONTROL: accepts the split-bill payload (one item + notes)', () => {
      expect(holdBillDataRejection({ ...webPayload, items: [webPayload.items[0]], notes: 'Split from active bill' })).toBeNull();
    });
    it('accepts an empty items array', () => {
      expect(holdBillDataRejection({ items: [] })).toBeNull();
    });
    it.each([
      [null, /must be an object/],
      [[], /must be an object/],
      ['x', /must be an object/],
      [{}, /items must be an array/],
      [{ items: 'v1' }, /items must be an array/],
      [{ items: [null] }, /line 1 must be an object/],
      [{ items: [{ variantId: 'v1', quantity: 0 }] }, /line 1: quantity/],
      [{ items: [{ variantId: 'v1', quantity: -400 }] }, /line 1: quantity/],
      [{ items: [{ variantId: 'v1', quantity: '2' }] }, /line 1: quantity/],
      [{ items: [{ variantId: 'v1' }] }, /line 1: quantity/],
      [{ items: [{ variantId: 'v1', quantity: 1 }, { variantId: 'v2', quantity: Number.POSITIVE_INFINITY }] }, /line 2: quantity/],
      [{ items: [{ variantId: 'v1', quantity: Number.NaN }] }, /line 1: quantity/],
      [{ items: [{ variantId: 42, quantity: 1 }] }, /variantId must be a string/],
    ])('refuses %j', (data, msg) => {
      expect(holdBillDataRejection(data)).toMatch(msg);
    });
    it('refuses an absurd number of lines', () => {
      expect(holdBillDataRejection({ items: Array.from({ length: 1001 }, () => ({ variantId: 'v', quantity: 1 })) })).toMatch(/at most/);
    });
  });

  describe('heldBillScopeWhere (P-F10 ownership)', () => {
    it('cashier: tenant + branch + own hold', () => {
      expect(heldBillScopeWhere('h1', 't1', 'b1', { cashierId: 'c1' })).toEqual({ id: 'h1', tenantId: 't1', branchId: 'b1', cashierId: 'c1' });
    });
    it('manager / admin: tenant + branch, any cashier', () => {
      expect(heldBillScopeWhere('h1', 't1', 'b1', { cashierId: 'c1', scopeAll: true })).toEqual({ id: 'h1', tenantId: 't1', branchId: 'b1' });
    });
    it('never drops the tenant or branch filter', () => {
      const w = heldBillScopeWhere('h1', 't1', 'b1');
      expect(w).toMatchObject({ tenantId: 't1', branchId: 'b1' });
    });
  });
});
