import {
  isWholeReloadQuantity,
  catalogCustomLineRejection,
  catalogReloadLineRejection,
  customLineNeedsManager,
  isCustomSaleLine,
} from './pos-reload-guard.helper';

describe('pos-reload-guard.helper (P-F1)', () => {
  describe('customLineNeedsManager', () => {
    it('requires manager authorization for custom bill-only items', () => {
      expect(customLineNeedsManager({ isCustom: true })).toBe(true);
      expect(customLineNeedsManager({ variantId: 'custom-item-1' })).toBe(true);
    });
    it('allows the validated reload flow to use its existing cashier workflow', () => {
      expect(customLineNeedsManager({ isCustom: true, reloadType: 'DIGITAL' })).toBe(false);
    });
  });

  describe('catalogCustomLineRejection', () => {
    it('refuses a real catalog variant marked as custom', () => {
      expect(catalogCustomLineRejection({ variantId: 'v-milk', isCustom: true })).toMatch(/cannot be submitted as a custom/);
    });
    it('allows an explicit custom bill line', () => {
      expect(catalogCustomLineRejection({ variantId: 'custom-item-1', isCustom: true })).toBeNull();
      expect(catalogCustomLineRejection({ isCustom: true })).toBeNull();
    });
  });

  describe('isCustomSaleLine', () => {
    it.each([
      [{ isCustom: true, variantId: 'v1' }, true],
      [{ variantId: '' }, true],
      [{ variantId: '   ' }, true],
      [{}, true],
      [{ variantId: 'custom-reload-abc' }, true],
      [{ variantId: 'v1' }, false],
      [{ variantId: 'v1', isCustom: false }, false],
    ])('%j -> %s', (item, expected) => {
      expect(isCustomSaleLine(item)).toBe(expected);
    });
  });

  describe('catalogReloadLineRejection', () => {
    it('refuses a catalog variant flagged reloadType=DIGITAL with no operator (was: price guard skipped)', () => {
      expect(catalogReloadLineRejection({ variantId: 'v-milk', productName: 'Milk', reloadType: 'DIGITAL' })).toMatch(/Milk: a catalog product cannot be sold as a reload/);
    });
    it('refuses a catalog variant flagged reloadType=PHYSICAL even with operator fields', () => {
      expect(catalogReloadLineRejection({ variantId: 'v-milk', sku: 'MILK1', reloadType: 'PHYSICAL' })).toMatch(/^MILK1:/);
    });
    it('a catalog line without reloadType goes through the price guard (null)', () => {
      expect(catalogReloadLineRejection({ variantId: 'v-milk', productName: 'Milk' })).toBeNull();
    });
    it('CONTROL: the web reload panel line (isCustom, custom-reload-… id) is accepted', () => {
      expect(catalogReloadLineRejection({ isCustom: true, variantId: 'custom-reload-k1-ab12', reloadType: 'DIGITAL' })).toBeNull();
    });
    it('CONTROL: the Quick Pay reload line (isCustom, no variantId) is accepted', () => {
      expect(catalogReloadLineRejection({ isCustom: true, reloadType: 'PHYSICAL' })).toBeNull();
    });
  });
});

describe('isWholeReloadQuantity (P-F21)', () => {
  it('accepts whole units, tolerating float noise', () => {
    for (const q of [1, 2, 10, 2.0000000001, '3' as unknown as number]) expect(isWholeReloadQuantity(q)).toBe(true);
  });
  it('refuses fractions, zero, negatives and non-numbers', () => {
    for (const q of [0.5, 2.5, 1.01, 0, -1, NaN, Infinity, undefined, null, 'abc']) expect(isWholeReloadQuantity(q)).toBe(false);
  });
});
