import {
  calculateExclusiveTax,
  calculateInclusiveTax,
  calculateLineTax,
  computeVatPeriodTotals,
  defaultTaxSeed,
  roundTax,
} from './tax.helper';

describe('Sprint 7 — VAT & Tax helpers', () => {
  it('calculates exclusive tax', () => {
    expect(calculateExclusiveTax(1000, 18)).toEqual({ net: 1000, tax: 180, gross: 1180 });
  });

  it('extracts inclusive tax', () => {
    const r = calculateInclusiveTax(1180, 18);
    expect(r.gross).toBe(1180);
    expect(r.tax).toBe(180);
    expect(r.net).toBe(1000);
  });

  it('computeVatPeriodTotals nets output − input', () => {
    const t = computeVatPeriodTotals({
      outputVat: 1800,
      inputVat: 500,
      salesNet: 10000,
      salesGross: 11800,
      purchasesNet: 3000,
      purchasesGross: 3500,
    });
    expect(t.netVat).toBe(1300);
    expect(roundTax(18.005)).toBe(18.01);
  });

  it('seeds default rates including VAT18', () => {
    const seed = defaultTaxSeed();
    expect(seed.some((r) => r.code === 'VAT18' && r.isDefault)).toBe(true);
    expect(calculateLineTax(200, 18, false).tax).toBe(36);
  });
});
