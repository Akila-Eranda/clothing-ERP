import { fractionalQuantityRejection, isWholeQuantity, productAllowsFractions } from './pos-quantity.helper';

describe('pos-quantity.helper (P-F16)', () => {
  describe('productAllowsFractions mirrors the web rule', () => {
    it('weighted kind, decimal flag or a weight unit allow fractions', () => {
      expect(productAllowsFractions({ productKind: 'WEIGHTED', allowDecimalSelling: false, unit: 'pcs' })).toBe(true);
      expect(productAllowsFractions({ productKind: 'STANDARD', allowDecimalSelling: true, unit: 'pcs' })).toBe(true);
      for (const unit of ['kg', 'KG', ' g ', 'gram', 'Grams', 'kilogram', 'kilograms']) {
        expect(productAllowsFractions({ productKind: 'STANDARD', allowDecimalSelling: false, unit })).toBe(true);
      }
    });
    it('a piece good with the flag off and no weight unit does not', () => {
      expect(productAllowsFractions({ productKind: 'STANDARD', allowDecimalSelling: false, unit: 'pcs' })).toBe(false);
      expect(productAllowsFractions({ productKind: null, allowDecimalSelling: null, unit: null })).toBe(false);
      expect(productAllowsFractions({ productKind: 'STANDARD', allowDecimalSelling: false, unit: 'bottle' })).toBe(false);
    });
  });

  describe('isWholeQuantity', () => {
    it('accepts whole numbers and float noise only', () => {
      expect([1, 2, 10, 2.0000000001, 3.9999999999].every(isWholeQuantity)).toBe(true);
      expect([0.5, 1.001, 2.5, NaN, Infinity].some(isWholeQuantity)).toBe(false);
    });
  });

  describe('fractionalQuantityRejection', () => {
    const piece = { productKind: 'STANDARD', allowDecimalSelling: false, unit: 'pcs' };
    it('refuses a fraction of a piece good with a clear message', () => {
      expect(fractionalQuantityRejection('Milk', 0.5, piece)).toMatch(/Milk is sold in whole units/);
    });
    it('allows whole quantities of a piece good and any quantity of a fractional product', () => {
      expect(fractionalQuantityRejection('Milk', 3, piece)).toBeNull();
      expect(fractionalQuantityRejection('Rice', 0.375, { ...piece, productKind: 'WEIGHTED' })).toBeNull();
      expect(fractionalQuantityRejection('Rice', 0.375, { ...piece, unit: 'kg' })).toBeNull();
    });
  });
});
