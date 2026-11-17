import { exactStock, exactStockOfRow, sumExactStock } from './exact-stock.helper';

describe('exact stock (purchasing)', () => {
  it('keeps negative stock exactly (never clamped to 0)', () => {
    expect(exactStock(-2, 0)).toBe(-2);
    expect(exactStock(1, 3)).toBe(-2);
    expect(exactStock(-0.5)).toBe(-0.5);
  });

  it('on hand minus reserved, rounded to 3 decimals', () => {
    expect(exactStock(10, 3)).toBe(7);
    expect(exactStock(0.1 + 0.2, 0)).toBe(0.3);
    expect(exactStock(null, null)).toBe(0);
  });

  it('POS product row: uses currentStock/reservedStock, not the clamped stock', () => {
    expect(exactStockOfRow({ stock: 0, currentStock: -2, reservedStock: 0 })).toBe(-2);
    expect(exactStockOfRow({ stock: 5 })).toBe(5);
  });

  it('sums several inventory rows without clamping each row', () => {
    expect(sumExactStock([{ quantity: -2, reservedQty: 0 }, { quantity: 5, reservedQty: 1 }])).toBe(2);
    expect(sumExactStock([])).toBe(0);
  });
});
